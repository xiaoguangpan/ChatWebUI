package server

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type PostgresStore struct {
	db         *pgxpool.Pool
	appSecret  string
	sessionTTL time.Duration
}

func NewStore(config Config) Store {
	store, err := NewPostgresStore(config)
	if err != nil {
		panic(err)
	}
	return store
}

func NewPostgresStore(config Config) (*PostgresStore, error) {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	store := &PostgresStore{db: pool, appSecret: config.AppSecret, sessionTTL: config.SessionTTL}
	if err := store.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if err := store.bootstrap(ctx, config); err != nil {
		pool.Close()
		return nil, err
	}
	return store, nil
}

func (s *PostgresStore) Close() {
	s.db.Close()
}

func (s *PostgresStore) migrate(ctx context.Context) error {
	dir := migrationsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("migration %s: %w", entry.Name(), err)
		}
	}
	return nil
}

func migrationsDir() string {
	for _, dir := range []string{
		"apps/api/migrations",
		"migrations",
		filepath.Join("..", "migrations"),
		filepath.Join("..", "..", "migrations"),
	} {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}
	return "apps/api/migrations"
}

func (s *PostgresStore) bootstrap(ctx context.Context, config Config) error {
	if err := s.seedUsers(ctx, config); err != nil {
		return err
	}
	if err := s.expireOpenSessions(ctx); err != nil {
		return err
	}
	if err := s.repairGeneratedUserNames(ctx); err != nil {
		return err
	}
	if err := s.syncSnapshotUserNames(ctx); err != nil {
		return err
	}
	if err := s.seedPolicies(ctx); err != nil {
		return err
	}
	if err := s.clearLegacyImageDefaults(ctx); err != nil {
		return err
	}
	if err := s.normalizeModelDisplayNames(ctx); err != nil {
		return err
	}
	if err := s.backfillChatGenerationsFromMessages(ctx); err != nil {
		return err
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO system_logs (id, level, type, message) VALUES ($1, 'info', 'system', 'PostgreSQL store initialized')`, newID("log"))
	return nil
}

func (s *PostgresStore) clearLegacyImageDefaults(ctx context.Context) error {
	const marker = "migration clear legacy image defaults 2026-05-25"
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM system_logs WHERE type='system' AND message=$1)`, marker).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	if _, err := s.db.Exec(ctx, `
		UPDATE models
		SET image_size='', image_quality='', updated_at=now()
		WHERE 'image'=ANY(capabilities) AND image_size='1024x1024' AND image_quality='standard'
	`); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `INSERT INTO system_logs (id, level, type, message) VALUES ($1, 'info', 'system', $2)`, newID("log"), marker)
	return err
}

func (s *PostgresStore) seedUsers(ctx context.Context, config Config) error {
	if err := s.ensureAdminUser(ctx, config); err != nil {
		return err
	}
	if config.SeedDemoUser {
		return s.ensureDemoUser(ctx)
	}
	return s.removeDefaultDemoUser(ctx)
}

func (s *PostgresStore) ensureAdminUser(ctx context.Context, config Config) error {
	account := firstNonEmpty(config.AdminAccount, "admin")
	password := firstNonEmpty(config.AdminPassword, defaultDevAdminPassword)
	var userID, hash string
	err := s.db.QueryRow(ctx, `SELECT id, password_hash FROM users WHERE account=$1`, account).Scan(&userID, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		_, err = s.createUser(ctx, account, password, "管理员", "admin", "plus", "active", 100000)
		return err
	}
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(ctx, `UPDATE users SET role='admin', plan='plus', status='active' WHERE id=$1`, userID); err != nil {
		return err
	}
	if config.AdminPasswordSet && password != defaultDevAdminPassword && bcrypt.CompareHashAndPassword([]byte(hash), []byte(defaultDevAdminPassword)) == nil {
		nextHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err := s.db.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, string(nextHash), userID); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) ensureDemoUser(ctx context.Context) error {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE account='demo@example.com')`).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return nil
	}
	_, err := s.createUser(ctx, "demo@example.com", "demo123456", "演示用户", "user", "free", "active", 200)
	return err
}

func (s *PostgresStore) removeDefaultDemoUser(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `DELETE FROM users WHERE account='demo@example.com' AND role='user' AND name='演示用户'`)
	return err
}

func (s *PostgresStore) expireOpenSessions(ctx context.Context) error {
	if s.sessionTTL <= 0 {
		return nil
	}
	_, err := s.db.Exec(ctx, `UPDATE sessions SET expires_at=created_at + ($1::bigint * interval '1 second') WHERE expires_at IS NULL`, int64(s.sessionTTL.Seconds()))
	return err
}

func (s *PostgresStore) repairGeneratedUserNames(ctx context.Context) error {
	rows, err := s.db.Query(ctx, `SELECT id, name FROM users WHERE role='user'`)
	if err != nil {
		return err
	}
	defer rows.Close()
	type row struct {
		id   string
		name string
	}
	items := []row{}
	for rows.Next() {
		var item row
		if err := rows.Scan(&item.id, &item.name); err == nil && isLegacyGeneratedName(item.name) {
			items = append(items, item)
		}
	}
	for _, item := range items {
		if _, err := s.db.Exec(ctx, `UPDATE users SET name=$1 WHERE id=$2`, s.generateUniqueNickname(ctx), item.id); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) syncSnapshotUserNames(ctx context.Context) error {
	if _, err := s.db.Exec(ctx, `UPDATE points_logs p SET user_name=u.name FROM users u WHERE p.user_id=u.id AND p.user_name<>u.name`); err != nil {
		return err
	}
	if _, err := s.db.Exec(ctx, `UPDATE generations g SET user_name=u.name FROM users u WHERE g.user_id=u.id AND g.user_name<>u.name`); err != nil {
		return err
	}
	return nil
}

func (s *PostgresStore) normalizeModelDisplayNames(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `UPDATE models SET display_name=upstream_id WHERE display_name<>upstream_id`)
	return err
}

func (s *PostgresStore) backfillChatGenerationsFromMessages(ctx context.Context) error {
	_, err := s.db.Exec(ctx, `
		INSERT INTO generations (
			id,user_id,user_name,type,model_id,model_name,provider_id,provider_name,prompt_markdown,response_markdown,
			image_urls,audio_base64,audio_format,tokens_in,tokens_out,points_cost,duration_ms,status,error_type,error_message,trace,created_at
		)
		SELECT
			'gen_' || m.id,
			c.user_id,
			u.name,
			'chat',
			m.model_id,
			COALESCE(NULLIF(md.upstream_id,''), NULLIF(m.model_id,''), 'unknown'),
			m.provider_id,
			COALESCE(NULLIF(p.name,''), NULLIF(m.provider_id,''), 'unknown'),
			COALESCE(prev.content_markdown, c.title),
			m.content_markdown,
			ARRAY[]::TEXT[],
			'',
			'',
			m.tokens_in,
			m.tokens_out,
			m.points_cost,
			0,
			'ok',
			'',
			'',
			m.id,
			m.created_at
		FROM messages m
		JOIN conversations c ON c.id=m.conversation_id
		JOIN users u ON u.id=c.user_id
		LEFT JOIN models md ON md.id=m.model_id
		LEFT JOIN providers p ON p.id=m.provider_id
		LEFT JOIN LATERAL (
			SELECT content_markdown
			FROM messages pm
			WHERE pm.conversation_id=m.conversation_id AND pm.role='user' AND pm.created_at<=m.created_at
			ORDER BY pm.created_at DESC
			LIMIT 1
		) prev ON true
		WHERE m.role='assistant'
			AND m.content_markdown <> ''
			AND NOT EXISTS (
				SELECT 1 FROM generations g WHERE g.trace=m.id OR g.id='gen_' || m.id
			)
	`)
	return err
}

func isLegacyGeneratedName(name string) bool {
	name = strings.TrimSpace(name)
	return name == "" || name == "用户.com" || strings.HasPrefix(name, "用户@") || strings.HasPrefix(name, "用户.")
}

func (s *PostgresStore) generateUniqueNickname(ctx context.Context) string {
	for i := 0; i < 40; i++ {
		name := randomGuofengNickname()
		if !s.nicknameExists(ctx, name) {
			return name
		}
	}
	for {
		name := uniqueNicknameFallback(randomGuofengNickname())
		if !s.nicknameExists(ctx, name) {
			return name
		}
	}
}

func (s *PostgresStore) nicknameExists(ctx context.Context, name string) bool {
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE name=$1)`, name).Scan(&exists)
	return exists
}

func (s *PostgresStore) seedPolicies(ctx context.Context) error {
	items := []PointsPolicy{
		{ID: "default_call", Name: "默认按次策略", Mode: "per_call", Summary: "文字 2 / 图片 10 / 语音 2 / 其他 1 积分", PerChat: 2, PerImage: 10, PerSpeech: 2, PerOther: 1, Enabled: true},
		{ID: "default_token", Name: "默认 Token 策略", Mode: "per_token", Summary: "按总 Token 计费，每千 Token 2 积分；图片模型固定使用按次计费", InputPer1K: 1, OutputPer1K: 1, Enabled: true},
	}
	for _, item := range items {
		if _, err := s.db.Exec(ctx, `
			INSERT INTO points_policies (id, name, mode, summary, input_per_1k, output_per_1k, per_chat, per_image, per_speech, per_other, enabled)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
			ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, mode=EXCLUDED.mode, summary=EXCLUDED.summary,
				input_per_1k=EXCLUDED.input_per_1k, output_per_1k=EXCLUDED.output_per_1k,
				per_chat=EXCLUDED.per_chat, per_image=EXCLUDED.per_image, per_speech=EXCLUDED.per_speech, per_other=EXCLUDED.per_other, enabled=EXCLUDED.enabled
		`, item.ID, item.Name, item.Mode, item.Summary, item.InputPer1K, item.OutputPer1K, item.PerChat, item.PerImage, item.PerSpeech, item.PerOther, item.Enabled); err != nil {
			return err
		}
	}
	return nil
}

func (s *PostgresStore) Register(account string, password string) (AuthResponse, error) {
	account = strings.TrimSpace(account)
	if account == "" || password == "" {
		return AuthResponse{}, errors.New("account and password are required")
	}
	if len(password) < 6 {
		return AuthResponse{}, errors.New("password must be at least 6 characters")
	}
	ctx := context.Background()
	user, err := s.createUser(ctx, account, password, s.generateUniqueNickname(ctx), "user", "free", "active", 0)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") {
			return AuthResponse{}, errors.New("account already registered")
		}
		return AuthResponse{}, err
	}
	_ = s.AddPointsLog(user.ID, "reward", 200, "register", user.ID, "注册赠送积分")
	if updated, ok := s.User(user.ID); ok {
		user = updated
	}
	token, err := s.createSession(ctx, user.ID)
	if err != nil {
		return AuthResponse{}, err
	}
	_, _ = s.db.Exec(ctx, `INSERT INTO system_logs (id, level, type, message) VALUES ($1,'info','auth',$2)`, newID("log"), "新用户注册 "+account)
	return AuthResponse{Token: token, User: user}, nil
}

func (s *PostgresStore) Login(account string, password string) (AuthResponse, error) {
	ctx := context.Background()
	var user User
	var hash string
	var createdAt, lastActive time.Time
	err := s.db.QueryRow(ctx, `
		SELECT id, account, name, role, plan, status, points, chats, images, avatar_url, password_hash, created_at, last_active
		FROM users WHERE account=$1
	`, strings.TrimSpace(account)).Scan(&user.ID, &user.Phone, &user.Name, &user.Role, &user.Plan, &user.Status, &user.Points, &user.Chats, &user.Images, &user.AvatarURL, &hash, &createdAt, &lastActive)
	if err != nil {
		return AuthResponse{}, errors.New("invalid account or password")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return AuthResponse{}, errors.New("invalid account or password")
	}
	user.CreatedAt = timeString(createdAt)
	user.LastActive = timeString(lastActive)
	_, _ = s.db.Exec(ctx, `UPDATE users SET last_active=now() WHERE id=$1`, user.ID)
	token, err := s.createSession(ctx, user.ID)
	if err != nil {
		return AuthResponse{}, err
	}
	return AuthResponse{Token: token, User: user}, nil
}

func (s *PostgresStore) UserByToken(token string) (User, bool) {
	ctx := context.Background()
	var user User
	var createdAt, lastActive time.Time
	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.account, u.name, u.role, u.plan, u.status, u.points, u.chats, u.images, u.avatar_url, u.created_at, u.last_active
		FROM sessions s JOIN users u ON u.id=s.user_id
		WHERE s.token=$1 AND (s.expires_at IS NULL OR s.expires_at > now())
	`, token).Scan(&user.ID, &user.Phone, &user.Name, &user.Role, &user.Plan, &user.Status, &user.Points, &user.Chats, &user.Images, &user.AvatarURL, &createdAt, &lastActive)
	if err != nil {
		return User{}, false
	}
	user.CreatedAt = timeString(createdAt)
	user.LastActive = timeString(lastActive)
	return user, true
}

func (s *PostgresStore) DeleteSession(token string) {
	if strings.TrimSpace(token) == "" {
		return
	}
	_, _ = s.db.Exec(context.Background(), `DELETE FROM sessions WHERE token=$1`, strings.TrimSpace(token))
}

func (s *PostgresStore) ListUsers() []User {
	ctx := context.Background()
	rows, err := s.db.Query(ctx, `SELECT id, account, name, role, plan, status, points, chats, images, avatar_url, created_at, last_active FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	users := []User{}
	for rows.Next() {
		user, err := scanUser(rows)
		if err == nil {
			users = append(users, user)
		}
	}
	return users
}

func (s *PostgresStore) AddUser(req CreateUserRequest) (User, error) {
	account := strings.TrimSpace(req.Phone)
	if account == "" {
		return User{}, errors.New("account is required")
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = s.generateUniqueNickname(context.Background())
	}
	role := firstNonEmpty(req.Role, "user")
	plan := firstNonEmpty(req.Plan, "free")
	status := firstNonEmpty(req.Status, "active")
	user, err := s.createUser(context.Background(), account, req.Password, name, role, plan, status, 0)
	if err != nil {
		return User{}, err
	}
	if req.Points > 0 {
		_ = s.AddPointsLog(user.ID, "admin", req.Points, "admin", "create_user", "管理员创建用户初始积分")
	}
	return user, nil
}

func (s *PostgresStore) User(id string) (User, bool) {
	return s.userByWhere(context.Background(), `id='`+strings.ReplaceAll(id, "'", "''")+`'`)
}

func (s *PostgresStore) ChangePassword(userID string, currentPassword string, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("new password must be at least 6 characters")
	}
	ctx := context.Background()
	var hash string
	if err := s.db.QueryRow(ctx, `SELECT password_hash FROM users WHERE id=$1`, userID).Scan(&hash); err != nil {
		return errors.New("user not found")
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(currentPassword)) != nil {
		return errors.New("current password is incorrect")
	}
	nextHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, string(nextHash), userID)
	return err
}

func (s *PostgresStore) ResetPassword(userID string, newPassword string) error {
	if len(newPassword) < 6 {
		return errors.New("new password must be at least 6 characters")
	}
	ctx := context.Background()
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)`, userID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return errors.New("user not found")
	}
	nextHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, string(nextHash), userID)
	return err
}

func (s *PostgresStore) UpdateProfile(userID string, req UpdateProfileRequest) (User, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return User{}, errors.New("name is required")
	}
	if len([]rune(name)) > 24 {
		return User{}, errors.New("name must be at most 24 characters")
	}
	_, err := s.db.Exec(context.Background(), `UPDATE users SET name=$1 WHERE id=$2`, name, userID)
	if err != nil {
		return User{}, err
	}
	user, ok := s.User(userID)
	if !ok {
		return User{}, errors.New("user not found")
	}
	return user, nil
}

func (s *PostgresStore) UpdateAvatar(userID string, avatarURL string) (User, error) {
	_, err := s.db.Exec(context.Background(), `UPDATE users SET avatar_url=$1 WHERE id=$2`, strings.TrimSpace(avatarURL), userID)
	if err != nil {
		return User{}, err
	}
	user, ok := s.User(userID)
	if !ok {
		return User{}, errors.New("user not found")
	}
	return user, nil
}

func (s *PostgresStore) ChangeUserPlan(id string, plan string) (User, error) {
	_, err := s.db.Exec(context.Background(), `UPDATE users SET plan=$1 WHERE id=$2`, firstNonEmpty(plan, "free"), id)
	if err != nil {
		return User{}, err
	}
	user, ok := s.User(id)
	if !ok {
		return User{}, errors.New("user not found")
	}
	return user, nil
}

func (s *PostgresStore) SetUserStatus(id string, status string) (User, error) {
	_, err := s.db.Exec(context.Background(), `UPDATE users SET status=$1 WHERE id=$2`, firstNonEmpty(status, "active"), id)
	if err != nil {
		return User{}, err
	}
	user, ok := s.User(id)
	if !ok {
		return User{}, errors.New("user not found")
	}
	return user, nil
}

func (s *PostgresStore) ListProviders() []Provider {
	rows, err := s.db.Query(context.Background(), `SELECT id, name, short, type, type_label, base_url, key_masked, enabled, remark FROM providers ORDER BY name ASC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []Provider{}
	for rows.Next() {
		var item Provider
		if err := rows.Scan(&item.ID, &item.Name, &item.Short, &item.Type, &item.TypeLabel, &item.BaseURL, &item.KeyMasked, &item.Enabled, &item.Remark); err == nil {
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) AddProvider(provider Provider) Provider {
	ctx := context.Background()
	if provider.ID == "" {
		provider.ID = slug(provider.Name)
	}
	if provider.Short == "" {
		provider.Short = strings.ToUpper(tail(provider.Name, 1))
	}
	if provider.Type == "" {
		provider.Type = "openai_compatible"
	}
	provider.TypeLabel = providerTypeLabel(provider.Type)
	if provider.KeyMasked == "" {
		provider.KeyMasked = maskKey(provider.APIKey)
	}
	ciphertext, nonce, _ := encryptString(s.appSecret, provider.APIKey)
	_, _ = s.db.Exec(ctx, `
		INSERT INTO providers (id, name, short, type, type_label, base_url, api_key_ciphertext, api_key_nonce, key_masked, enabled, remark, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
		ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, short=EXCLUDED.short, type=EXCLUDED.type, type_label=EXCLUDED.type_label, base_url=EXCLUDED.base_url,
			api_key_ciphertext=CASE WHEN EXCLUDED.api_key_ciphertext='' THEN providers.api_key_ciphertext ELSE EXCLUDED.api_key_ciphertext END,
			api_key_nonce=CASE WHEN EXCLUDED.api_key_nonce='' THEN providers.api_key_nonce ELSE EXCLUDED.api_key_nonce END,
			key_masked=CASE WHEN EXCLUDED.key_masked='未配置' THEN providers.key_masked ELSE EXCLUDED.key_masked END,
			enabled=EXCLUDED.enabled, remark=EXCLUDED.remark, updated_at=now()
	`, provider.ID, provider.Name, provider.Short, provider.Type, provider.TypeLabel, provider.BaseURL, ciphertext, nonce, provider.KeyMasked, provider.Enabled, provider.Remark)
	return provider
}

func (s *PostgresStore) PatchProvider(id string, patch PatchProviderRequest) (Provider, error) {
	provider, ok := s.Provider(id)
	if !ok {
		return Provider{}, errors.New("provider not found")
	}
	if patch.Name != nil {
		provider.Name = *patch.Name
	}
	if patch.Short != nil {
		provider.Short = *patch.Short
	}
	if patch.Type != nil {
		provider.Type = *patch.Type
		provider.TypeLabel = providerTypeLabel(provider.Type)
	}
	if patch.BaseURL != nil {
		provider.BaseURL = strings.TrimRight(*patch.BaseURL, "/")
	}
	if patch.Enabled != nil {
		provider.Enabled = *patch.Enabled
	}
	if patch.Remark != nil {
		provider.Remark = *patch.Remark
	}
	_, err := s.db.Exec(context.Background(), `UPDATE providers SET name=$1, short=$2, type=$3, type_label=$4, base_url=$5, enabled=$6, remark=$7, updated_at=now() WHERE id=$8`,
		provider.Name, provider.Short, provider.Type, provider.TypeLabel, provider.BaseURL, provider.Enabled, provider.Remark, id)
	return provider, err
}

func (s *PostgresStore) Provider(id string) (Provider, bool) {
	var p Provider
	var ciphertext, nonce string
	err := s.db.QueryRow(context.Background(), `SELECT id, name, short, type, type_label, base_url, api_key_ciphertext, api_key_nonce, key_masked, enabled, remark FROM providers WHERE id=$1`, id).
		Scan(&p.ID, &p.Name, &p.Short, &p.Type, &p.TypeLabel, &p.BaseURL, &ciphertext, &nonce, &p.KeyMasked, &p.Enabled, &p.Remark)
	if err != nil {
		return Provider{}, false
	}
	p.APIKey = decryptString(s.appSecret, ciphertext, nonce)
	return p, true
}

func (s *PostgresStore) ListModels() []Model {
	rows, err := s.db.Query(context.Background(), modelSelectSQL()+` ORDER BY m.sort_weight DESC, m.upstream_id ASC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanModels(rows)
}

func (s *PostgresStore) AddModel(model Model) Model {
	if model.ID == "" {
		model.ID = slug(model.ProviderID + "-" + model.UpstreamID)
	}
	if model.Group == "" {
		model.Group = model.ProviderID
	}
	model.DisplayName = model.UpstreamID
	if len(model.Capabilities) == 0 {
		model.Capabilities = []string{"chat"}
	}
	if model.Visibility == "" {
		model.Visibility = "draft"
	}
	model.SSE = hasCapability(model, "chat")
	if model.SortWeight == 0 {
		model.SortWeight = 100
	}
	if model.PointsPolicyID == "" {
		model.PointsPolicyID = defaultPolicyForCapabilities(model.Capabilities)
	}
	if model.SmokeStatus == "" {
		model.SmokeStatus = "untested"
	}
	if model.HealthStatus == "" {
		model.HealthStatus = "unused"
	}
	if model.HealthText == "" {
		model.HealthText = "未调用"
	}
	if model.Calls7d == "" {
		model.Calls7d = "0"
	}
	_, _ = s.db.Exec(context.Background(), `
		INSERT INTO models (id, provider_id, model_group, upstream_id, display_name, description, capabilities, enabled, visibility, default_role, sort_weight, sse, context_window, points_policy_id, rpm, tpm, max_concurrency, timeout_total_sec, image_size, image_quality, voice, audio_format, reasoning_effort, smoke_status, health_status, health_text, calls_7d, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,now())
		ON CONFLICT (id) DO UPDATE SET provider_id=EXCLUDED.provider_id, model_group=EXCLUDED.model_group, upstream_id=EXCLUDED.upstream_id, display_name=EXCLUDED.display_name,
			description=EXCLUDED.description, capabilities=EXCLUDED.capabilities, enabled=EXCLUDED.enabled, visibility=EXCLUDED.visibility, default_role=EXCLUDED.default_role,
			sort_weight=EXCLUDED.sort_weight, sse=EXCLUDED.sse, context_window=EXCLUDED.context_window, points_policy_id=EXCLUDED.points_policy_id,
			rpm=EXCLUDED.rpm, tpm=EXCLUDED.tpm, max_concurrency=EXCLUDED.max_concurrency, timeout_total_sec=EXCLUDED.timeout_total_sec,
			image_size=EXCLUDED.image_size, image_quality=EXCLUDED.image_quality, voice=EXCLUDED.voice, audio_format=EXCLUDED.audio_format, reasoning_effort=EXCLUDED.reasoning_effort, updated_at=now()
	`, model.ID, model.ProviderID, model.Group, model.UpstreamID, model.DisplayName, model.Description, model.Capabilities, model.Enabled, model.Visibility, model.DefaultRole, model.SortWeight, model.SSE, model.ContextWindow, model.PointsPolicyID, model.RPM, model.TPM, model.MaxConcurrency, model.TimeoutTotalSec, model.ImageSize, model.ImageQuality, model.Voice, model.AudioFormat, model.ReasoningEffort, model.SmokeStatus, model.HealthStatus, model.HealthText, model.Calls7d)
	return model
}

func (s *PostgresStore) ListAvailableModels(kind string, user User) []Model {
	items := []Model{}
	for _, item := range s.ListModels() {
		if item.Enabled && hasCapability(item, kind) && visibleTo(item.Visibility, user) {
			items = append(items, item)
		}
	}
	sortModels(items)
	return items
}

func (s *PostgresStore) Model(id string) (Model, bool) {
	rows, err := s.db.Query(context.Background(), modelSelectSQL()+` WHERE m.id=$1`, id)
	if err != nil {
		return Model{}, false
	}
	defer rows.Close()
	items := scanModels(rows)
	if len(items) == 0 {
		return Model{}, false
	}
	return items[0], true
}

func (s *PostgresStore) DeleteModel(id string) error {
	result, err := s.db.Exec(context.Background(), `DELETE FROM models WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return errors.New("model not found")
	}
	return nil
}

func (s *PostgresStore) ListPolicies() []PointsPolicy {
	rows, err := s.db.Query(context.Background(), `SELECT id, name, mode, summary, input_per_1k, output_per_1k, per_chat, per_image, per_speech, per_other, enabled FROM points_policies ORDER BY id ASC`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []PointsPolicy{}
	for rows.Next() {
		var item PointsPolicy
		if err := rows.Scan(&item.ID, &item.Name, &item.Mode, &item.Summary, &item.InputPer1K, &item.OutputPer1K, &item.PerChat, &item.PerImage, &item.PerSpeech, &item.PerOther, &item.Enabled); err == nil {
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) policyByID(id string) (PointsPolicy, bool) {
	var policy PointsPolicy
	err := s.db.QueryRow(context.Background(), `SELECT id, name, mode, summary, input_per_1k, output_per_1k, per_chat, per_image, per_speech, per_other, enabled FROM points_policies WHERE id=$1`, id).
		Scan(&policy.ID, &policy.Name, &policy.Mode, &policy.Summary, &policy.InputPer1K, &policy.OutputPer1K, &policy.PerChat, &policy.PerImage, &policy.PerSpeech, &policy.PerOther, &policy.Enabled)
	return policy, err == nil
}

func (s *PostgresStore) AddPolicy(policy PointsPolicy) (PointsPolicy, error) {
	policy.ID = strings.TrimSpace(policy.ID)
	policy.Name = strings.TrimSpace(policy.Name)
	policy.Mode = strings.TrimSpace(policy.Mode)
	policy.Summary = strings.TrimSpace(policy.Summary)
	if policy.Name == "" {
		return PointsPolicy{}, errors.New("policy name is required")
	}
	if policy.ID == "" {
		policy.ID = slug(policy.Name)
	}
	var err error
	policy, err = normalizePolicy(policy)
	if err != nil {
		return PointsPolicy{}, err
	}
	if policy.Summary == "" {
		policy.Summary = policy.Name
	}
	_, err = s.db.Exec(context.Background(), `
		INSERT INTO points_policies (id, name, mode, summary, input_per_1k, output_per_1k, per_chat, per_image, per_speech, per_other, enabled)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`, policy.ID, policy.Name, policy.Mode, policy.Summary, policy.InputPer1K, policy.OutputPer1K, policy.PerChat, policy.PerImage, policy.PerSpeech, policy.PerOther, policy.Enabled)
	if err != nil {
		return PointsPolicy{}, err
	}
	return policy, nil
}

func normalizePolicy(policy PointsPolicy) (PointsPolicy, error) {
	policy.Mode = strings.ToLower(strings.TrimSpace(policy.Mode))
	if policy.Mode == "" {
		policy.Mode = "per_call"
	}
	if policy.PerChat < 0 || policy.PerImage < 0 || policy.PerSpeech < 0 || policy.PerOther < 0 || policy.InputPer1K < 0 || policy.OutputPer1K < 0 {
		return PointsPolicy{}, errors.New("policy points must be greater than or equal to 0")
	}
	switch policy.Mode {
	case "per_call":
		if policy.PerChat == 0 {
			policy.PerChat = 2
		}
		if policy.PerImage == 0 {
			policy.PerImage = 10
		}
		if policy.PerSpeech == 0 {
			policy.PerSpeech = 2
		}
		if policy.PerOther == 0 {
			policy.PerOther = 1
		}
		policy.InputPer1K = 0
		policy.OutputPer1K = 0
	case "per_token":
		if policy.InputPer1K == 0 && policy.OutputPer1K == 0 {
			policy.InputPer1K = 1
			policy.OutputPer1K = 1
		}
		policy.PerChat = 0
		policy.PerImage = 0
		policy.PerSpeech = 0
		policy.PerOther = 0
	default:
		return PointsPolicy{}, errors.New("policy mode must be per_call or per_token")
	}
	return policy, nil
}

func (s *PostgresStore) PatchPolicy(id string, patch PatchPolicyRequest) (PointsPolicy, error) {
	current := PointsPolicy{}
	for _, item := range s.ListPolicies() {
		if item.ID == id {
			current = item
			break
		}
	}
	if current.ID == "" {
		return PointsPolicy{}, errors.New("points policy not found")
	}
	if patch.Name != nil {
		current.Name = *patch.Name
	}
	if patch.Mode != nil {
		current.Mode = *patch.Mode
	}
	if patch.Summary != nil {
		current.Summary = *patch.Summary
	}
	if patch.InputPer1K != nil {
		current.InputPer1K = *patch.InputPer1K
	}
	if patch.OutputPer1K != nil {
		current.OutputPer1K = *patch.OutputPer1K
	}
	if patch.PerChat != nil {
		current.PerChat = *patch.PerChat
	}
	if patch.PerImage != nil {
		current.PerImage = *patch.PerImage
	}
	if patch.PerSpeech != nil {
		current.PerSpeech = *patch.PerSpeech
	}
	if patch.PerOther != nil {
		current.PerOther = *patch.PerOther
	}
	if patch.Enabled != nil {
		current.Enabled = *patch.Enabled
	}
	var err error
	current, err = normalizePolicy(current)
	if err != nil {
		return PointsPolicy{}, err
	}
	_, err = s.db.Exec(context.Background(), `UPDATE points_policies SET name=$1, mode=$2, summary=$3, input_per_1k=$4, output_per_1k=$5, per_chat=$6, per_image=$7, per_speech=$8, per_other=$9, enabled=$10 WHERE id=$11`,
		current.Name, current.Mode, current.Summary, current.InputPer1K, current.OutputPer1K, current.PerChat, current.PerImage, current.PerSpeech, current.PerOther, current.Enabled, id)
	return current, err
}

func (s *PostgresStore) PatchModel(id string, patch PatchModelRequest) (Model, error) {
	model, ok := s.Model(id)
	if !ok {
		return Model{}, errors.New("model not found")
	}
	model.DisplayName = model.UpstreamID
	if patch.Enabled != nil {
		model.Enabled = *patch.Enabled
	}
	if patch.Visibility != nil {
		model.Visibility = *patch.Visibility
	}
	if model.DefaultRole != "" && model.Visibility != "public" {
		return Model{}, errors.New("default model must be public")
	}
	if patch.DefaultRole != nil {
		model.DefaultRole = *patch.DefaultRole
	}
	if model.DefaultRole != "" && model.Visibility != "public" {
		return Model{}, errors.New("default model must be public")
	}
	if patch.SortWeight != nil {
		model.SortWeight = *patch.SortWeight
	}
	if patch.SSE != nil && hasCapability(model, "chat") {
		model.SSE = *patch.SSE
	}
	if patch.PointsPolicyID != nil {
		policy, ok := s.policyByID(*patch.PointsPolicyID)
		if !ok {
			return Model{}, errors.New("points policy not found")
		}
		if hasCapability(model, "image") && strings.EqualFold(policy.Mode, "per_token") {
			return Model{}, errors.New("image models must use per-call points policy")
		}
		model.PointsPolicyID = *patch.PointsPolicyID
	}
	if patch.ImageSize != nil {
		model.ImageSize = *patch.ImageSize
	}
	if patch.ImageQuality != nil {
		model.ImageQuality = *patch.ImageQuality
	}
	if patch.Voice != nil {
		model.Voice = *patch.Voice
	}
	if patch.AudioFormat != nil {
		model.AudioFormat = *patch.AudioFormat
	}
	_, err := s.db.Exec(context.Background(), `
		UPDATE models SET display_name=$1, enabled=$2, visibility=$3, default_role=$4, sort_weight=$5, sse=$6, points_policy_id=$7,
			image_size=$8, image_quality=$9, voice=$10, audio_format=$11, updated_at=now()
		WHERE id=$12
	`, model.DisplayName, model.Enabled, model.Visibility, model.DefaultRole, model.SortWeight, model.SSE, model.PointsPolicyID, model.ImageSize, model.ImageQuality, model.Voice, model.AudioFormat, id)
	if err != nil {
		return Model{}, err
	}
	updated, ok := s.Model(id)
	if !ok {
		return Model{}, errors.New("model not found")
	}
	return updated, nil
}

func (s *PostgresStore) SetDefaultModel(id string, role string) (Model, error) {
	model, ok := s.Model(id)
	if !ok {
		return Model{}, errors.New("model not found")
	}
	if role == "" {
		role = defaultRoleForModel(model)
	}
	if role == "" {
		return Model{}, errors.New("model cannot be default for any role")
	}
	if model.Visibility != "public" {
		return Model{}, errors.New("only public models can be set as default")
	}
	ctx := context.Background()
	capability := "chat"
	if role == "image" || role == "embedding" {
		capability = role
	} else if role == "tts" {
		capability = "speech"
	}
	var maxWeight int
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(MAX(sort_weight),0) FROM models WHERE $1=ANY(capabilities) AND visibility='public'`, capability).Scan(&maxWeight)
	nextWeight := maxWeight + 100
	if nextWeight < model.SortWeight {
		nextWeight = model.SortWeight
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Model{}, err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `UPDATE models SET default_role='' WHERE default_role=$1 AND id<>$2`, role, id); err != nil {
		return Model{}, err
	}
	if _, err := tx.Exec(ctx, `UPDATE models SET default_role=$1, sort_weight=$3 WHERE id=$2`, role, id, nextWeight); err != nil {
		return Model{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Model{}, err
	}
	updated, ok := s.Model(id)
	if !ok {
		return Model{}, errors.New("model not found")
	}
	return updated, nil
}

func (s *PostgresStore) AddConversation(userID string, title string) Conversation {
	if strings.TrimSpace(title) == "" {
		title = "新会话"
	}
	item := Conversation{ID: newID("conv"), UserID: userID, Title: title}
	var createdAt, updatedAt time.Time
	_ = s.db.QueryRow(context.Background(), `INSERT INTO conversations (id,user_id,title) VALUES ($1,$2,$3) RETURNING created_at, updated_at`, item.ID, item.UserID, item.Title).Scan(&createdAt, &updatedAt)
	item.CreatedAt = timeString(createdAt)
	item.UpdatedAt = timeString(updatedAt)
	return item
}

func (s *PostgresStore) ListConversations(userID string) []Conversation {
	rows, err := s.db.Query(context.Background(), `SELECT id,user_id,title,created_at,updated_at FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []Conversation{}
	for rows.Next() {
		var item Conversation
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.UserID, &item.Title, &createdAt, &updatedAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			item.UpdatedAt = timeString(updatedAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) DeleteConversation(conversationID string) error {
	result, err := s.db.Exec(context.Background(), `DELETE FROM conversations WHERE id=$1`, conversationID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return errors.New("conversation not found")
	}
	return nil
}

func (s *PostgresStore) AddMessage(message Message) Message {
	if message.ID == "" {
		message.ID = newID("msg")
	}
	var createdAt time.Time
	_ = s.db.QueryRow(context.Background(), `
		INSERT INTO messages (id, conversation_id, role, content_markdown, model_id, provider_id, tokens_in, tokens_out, points_cost)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING created_at
	`, message.ID, message.ConversationID, message.Role, message.ContentMarkdown, message.ModelID, message.ProviderID, message.TokensIn, message.TokensOut, message.PointsCost).Scan(&createdAt)
	message.CreatedAt = timeString(createdAt)
	_, _ = s.db.Exec(context.Background(), `UPDATE conversations SET updated_at=$1 WHERE id=$2`, createdAt, message.ConversationID)
	return message
}

func (s *PostgresStore) Messages(conversationID string) []Message {
	rows, err := s.db.Query(context.Background(), `SELECT id, conversation_id, role, content_markdown, model_id, provider_id, tokens_in, tokens_out, points_cost, created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC`, conversationID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []Message{}
	for rows.Next() {
		var item Message
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.ConversationID, &item.Role, &item.ContentMarkdown, &item.ModelID, &item.ProviderID, &item.TokensIn, &item.TokensOut, &item.PointsCost, &createdAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) DeleteMessagePair(conversationID string, messageID string) error {
	messages := s.Messages(conversationID)
	targetIndex := -1
	for i, message := range messages {
		if message.ID == messageID {
			targetIndex = i
			break
		}
	}
	if targetIndex < 0 {
		return errors.New("message not found")
	}
	ids := []string{messages[targetIndex].ID}
	switch messages[targetIndex].Role {
	case "assistant":
		if targetIndex > 0 && messages[targetIndex-1].Role == "user" {
			ids = append(ids, messages[targetIndex-1].ID)
		}
	case "user":
		if targetIndex+1 < len(messages) && messages[targetIndex+1].Role == "assistant" {
			ids = append(ids, messages[targetIndex+1].ID)
		}
	}
	ctx := context.Background()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, id := range ids {
		if _, err := tx.Exec(ctx, `DELETE FROM messages WHERE conversation_id=$1 AND id=$2`, conversationID, id); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE conversations SET updated_at=now() WHERE id=$1`, conversationID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) AddGeneration(gen Generation) Generation {
	if gen.ID == "" {
		gen.ID = newID("req")
	}
	if gen.ImageURLs == nil {
		gen.ImageURLs = []string{}
	}
	var createdAt time.Time
	if err := s.db.QueryRow(context.Background(), `
		INSERT INTO generations (id,user_id,user_name,type,model_id,model_name,provider_id,provider_name,prompt_markdown,response_markdown,image_urls,audio_base64,audio_format,tokens_in,tokens_out,points_cost,duration_ms,status,error_type,error_message,trace)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING created_at
	`, gen.ID, gen.UserID, gen.UserName, gen.Type, gen.ModelID, gen.ModelName, gen.ProviderID, gen.ProviderName, gen.PromptMarkdown, gen.ResponseMarkdown, gen.ImageURLs, gen.AudioBase64, gen.AudioFormat, gen.TokensIn, gen.TokensOut, gen.PointsCost, gen.DurationMs, gen.Status, gen.ErrorType, gen.ErrorMessage, gen.Trace).Scan(&createdAt); err != nil {
		s.AddSystemLog("error", "generation", fmt.Sprintf("generation insert failed id=%s user=%s error=%s", gen.ID, gen.UserID, err.Error()))
		return gen
	}
	gen.CreatedAt = timeString(createdAt)
	switch gen.Type {
	case "chat":
		_, _ = s.db.Exec(context.Background(), `UPDATE users SET chats=chats+1, last_active=now() WHERE id=$1`, gen.UserID)
	case "image":
		if gen.Status == "ok" {
			count := len(gen.ImageURLs)
			if count == 0 {
				count = 1
			}
			_, _ = s.db.Exec(context.Background(), `UPDATE users SET images=images+$1, last_active=now() WHERE id=$2`, count, gen.UserID)
		} else {
			_, _ = s.db.Exec(context.Background(), `UPDATE users SET last_active=now() WHERE id=$1`, gen.UserID)
		}
	default:
		_, _ = s.db.Exec(context.Background(), `UPDATE users SET last_active=now() WHERE id=$1`, gen.UserID)
	}
	return gen
}

func (s *PostgresStore) ListGenerations() []Generation {
	rows, err := s.db.Query(context.Background(), generationSelectSQL()+` ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanGenerations(rows)
}

func (s *PostgresStore) ListUserGenerations(userID string) []Generation {
	rows, err := s.db.Query(context.Background(), generationSelectSQL()+` WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanGenerations(rows)
}

func (s *PostgresStore) DeleteUserGeneration(userID string, generationID string) error {
	ctx := context.Background()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var typ string
	var imageCount int
	if err := tx.QueryRow(ctx, `SELECT type, COALESCE(cardinality(image_urls),0) FROM generations WHERE id=$1 AND user_id=$2 FOR UPDATE`, generationID, userID).Scan(&typ, &imageCount); err != nil {
		return errors.New("generation not found")
	}
	tag, err := tx.Exec(ctx, `DELETE FROM generations WHERE id=$1 AND user_id=$2`, generationID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("generation not found")
	}
	if typ == "image" && imageCount > 0 {
		if _, err := tx.Exec(ctx, `UPDATE users SET images=GREATEST(images-$1, 0), last_active=now() WHERE id=$2`, imageCount, userID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func generationSelectSQL() string {
	return `SELECT id,user_id,user_name,type,model_id,model_name,provider_id,provider_name,prompt_markdown,response_markdown,image_urls,audio_base64,audio_format,tokens_in,tokens_out,points_cost,duration_ms,status,error_type,error_message,trace,created_at FROM generations`
}

func scanGenerations(rows pgx.Rows) []Generation {
	items := []Generation{}
	for rows.Next() {
		var item Generation
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.UserID, &item.UserName, &item.Type, &item.ModelID, &item.ModelName, &item.ProviderID, &item.ProviderName, &item.PromptMarkdown, &item.ResponseMarkdown, &item.ImageURLs, &item.AudioBase64, &item.AudioFormat, &item.TokensIn, &item.TokensOut, &item.PointsCost, &item.DurationMs, &item.Status, &item.ErrorType, &item.ErrorMessage, &item.Trace, &createdAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) UpdateGenerationAudio(id string, audioBase64 string, format string) {
	_, _ = s.db.Exec(context.Background(), `UPDATE generations SET audio_base64=$1, audio_format=$2 WHERE id=$3`, audioBase64, format, id)
}

func (s *PostgresStore) AddPointsLog(userID string, typ string, amount int, sourceType string, sourceID string, remark string) PointsLog {
	ctx := context.Background()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return PointsLog{}
	}
	defer tx.Rollback(ctx)
	log, _ := s.addPointsLogTx(ctx, tx, userID, typ, amount, sourceType, sourceID, remark)
	_ = tx.Commit(ctx)
	return log
}

func (s *PostgresStore) ListPointsLogs() []PointsLog {
	rows, err := s.db.Query(context.Background(), `SELECT id,user_id,user_name,type,amount,balance_before,balance_after,source_type,source_id,remark,created_at FROM points_logs ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanPointsLogs(rows)
}

func (s *PostgresStore) ListUserPointsLogs(userID string) []PointsLog {
	rows, err := s.db.Query(context.Background(), `SELECT id,user_id,user_name,type,amount,balance_before,balance_after,source_type,source_id,remark,created_at FROM points_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 500`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	return scanPointsLogs(rows)
}

func scanPointsLogs(rows pgx.Rows) []PointsLog {
	items := []PointsLog{}
	for rows.Next() {
		var item PointsLog
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.UserID, &item.UserName, &item.Type, &item.Amount, &item.BalanceBefore, &item.BalanceAfter, &item.SourceType, &item.SourceID, &item.Remark, &createdAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) AddSystemLog(level string, typ string, message string) SystemLog {
	item := SystemLog{ID: newID("log"), Level: level, Type: typ, Message: message}
	var createdAt time.Time
	_ = s.db.QueryRow(context.Background(), `INSERT INTO system_logs (id, level, type, message) VALUES ($1,$2,$3,$4) RETURNING created_at`, item.ID, item.Level, item.Type, item.Message).Scan(&createdAt)
	item.CreatedAt = timeString(createdAt)
	return item
}

func (s *PostgresStore) ListSystemLogs() []SystemLog {
	rows, err := s.db.Query(context.Background(), `SELECT id, level, type, message, created_at FROM system_logs ORDER BY created_at DESC LIMIT 500`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []SystemLog{}
	for rows.Next() {
		var item SystemLog
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.Level, &item.Type, &item.Message, &createdAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) AddLoginHistory(userID string, account string, ip string, userAgent string, status string, message string) LoginHistory {
	item := LoginHistory{ID: newID("login"), UserID: userID, Account: account, IP: ip, UserAgent: userAgent, Status: status, Message: message}
	var createdAt time.Time
	_ = s.db.QueryRow(context.Background(), `
		INSERT INTO login_history (id, user_id, account, ip, user_agent, status, message)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING created_at
	`, item.ID, item.UserID, item.Account, item.IP, item.UserAgent, item.Status, item.Message).Scan(&createdAt)
	item.CreatedAt = timeString(createdAt)
	return item
}

func (s *PostgresStore) ListLoginHistory(userID string) []LoginHistory {
	rows, err := s.db.Query(context.Background(), `
		SELECT id, user_id, account, ip, user_agent, status, message, created_at
		FROM login_history
		WHERE user_id=$1
		ORDER BY created_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	items := []LoginHistory{}
	for rows.Next() {
		var item LoginHistory
		var createdAt time.Time
		if err := rows.Scan(&item.ID, &item.UserID, &item.Account, &item.IP, &item.UserAgent, &item.Status, &item.Message, &createdAt); err == nil {
			item.CreatedAt = timeString(createdAt)
			items = append(items, item)
		}
	}
	return items
}

func (s *PostgresStore) Charge(userID string, amount int, sourceType string, sourceID string, remark string) error {
	if amount <= 0 {
		return nil
	}
	ctx := context.Background()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var points int
	if err := tx.QueryRow(ctx, `SELECT points FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&points); err != nil {
		return err
	}
	if points < amount {
		return errors.New("insufficient points")
	}
	if _, err := s.addPointsLogTx(ctx, tx, userID, "consume", -amount, sourceType, sourceID, remark); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PostgresStore) MarkModelSuccess(modelID string, latency int64) {
	model, ok := s.Model(modelID)
	if !ok {
		return
	}
	_, _ = s.db.Exec(context.Background(), `UPDATE models SET smoke_status='ok', smoke_latency_ms=$1, smoke_error='', smoke_error_type='', smoke_error_detail='', health_status='healthy', health_text=$2, calls_7d=$3 WHERE id=$4`,
		latency, fmt.Sprintf("可用 · %.2fs", float64(latency)/1000), incrementCompact(model.Calls7d), modelID)
}

func (s *PostgresStore) MarkModelFailure(modelID string, errorType string, message string) {
	_, _ = s.db.Exec(context.Background(), `UPDATE models SET smoke_status='error', smoke_error=$1, smoke_error_type=$2, smoke_error_detail=$1, health_status='abnormal', health_text='调用失败' WHERE id=$3`, message, errorType, modelID)
}

func (s *PostgresStore) Dashboard() map[string]any {
	ctx := context.Background()
	var users, conversations, images, points int
	_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&users)
	_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM conversations`).Scan(&conversations)
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(SUM(cardinality(image_urls)),0) FROM generations WHERE type='image' AND status='ok'`).Scan(&images)
	_ = s.db.QueryRow(ctx, `SELECT COALESCE(SUM(points_cost),0) FROM generations WHERE status='ok'`).Scan(&points)
	modelUsage := map[string]int{}
	for _, gen := range s.ListGenerations() {
		if gen.Status == "ok" {
			modelName := firstNonEmpty(gen.ModelID, gen.ModelName)
			if strings.TrimSpace(gen.ProviderName) != "" {
				modelName = modelName + " / " + gen.ProviderName
			}
			modelUsage[modelName]++
		}
	}
	trend := []int{}
	rows, err := s.db.Query(ctx, `
		SELECT COUNT(c.id)::int
		FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') day
		LEFT JOIN conversations c ON c.created_at >= day AND c.created_at < day + interval '1 day'
		GROUP BY day
		ORDER BY day ASC
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var count int
			if err := rows.Scan(&count); err == nil {
				trend = append(trend, count)
			}
		}
	}
	if len(trend) != 7 {
		trend = []int{0, 0, 0, 0, 0, 0, conversations}
	}
	var modelCount int
	_ = s.db.QueryRow(ctx, `SELECT COUNT(*) FROM models`).Scan(&modelCount)
	return map[string]any{
		"summary":     map[string]any{"users": users, "conversations": conversations, "images": images, "points": points},
		"trend":       trend,
		"model_usage": modelUsage,
		"recent":      s.ListGenerations(),
		"system":      map[string]any{"api_latency": "实时", "database": "PostgreSQL", "mode": "PostgreSQL", "models": modelCount},
	}
}

func (s *PostgresStore) PointsForModel(model Model, units int) int {
	policy, ok := s.policyByID(model.PointsPolicyID)
	if !ok || !policy.Enabled {
		return 0
	}
	mode := strings.ToLower(strings.TrimSpace(policy.Mode))
	if hasCapability(model, "image") {
		return perCallPointsForModel(model, policy)
	}
	if mode == "per_token" {
		if units <= 0 {
			units = 1
		}
		rate := policy.InputPer1K + policy.OutputPer1K
		if rate <= 0 {
			rate = 1
		}
		points := (units*rate + 999) / 1000
		if points <= 0 {
			return 1
		}
		return points
	}
	return perCallPointsForModel(model, policy)
}

func perCallPointsForModel(model Model, policy PointsPolicy) int {
	points := policy.PerOther
	if hasCapability(model, "image") {
		points = policy.PerImage
	} else if hasCapability(model, "speech") {
		points = policy.PerSpeech
	} else if hasCapability(model, "chat") || hasCapability(model, "vision") || hasCapability(model, "tool") {
		points = policy.PerChat
	}
	if points > 0 {
		return points
	}
	if hasCapability(model, "image") {
		return 10
	}
	if hasCapability(model, "speech") || hasCapability(model, "chat") || hasCapability(model, "vision") || hasCapability(model, "tool") {
		return 2
	}
	return 1
}

func (s *PostgresStore) createUser(ctx context.Context, account string, password string, name string, role string, plan string, status string, points int) (User, error) {
	if strings.TrimSpace(password) == "" {
		return User{}, errors.New("password is required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	user := User{ID: newID("user"), Phone: strings.TrimSpace(account), Name: name, Role: role, Plan: plan, Status: status, Points: points}
	var createdAt, lastActive time.Time
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (id, account, name, role, plan, status, points, password_hash)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING created_at, last_active
	`, user.ID, user.Phone, user.Name, user.Role, user.Plan, user.Status, user.Points, string(hash)).Scan(&createdAt, &lastActive)
	if err != nil {
		return User{}, err
	}
	user.CreatedAt = timeString(createdAt)
	user.LastActive = timeString(lastActive)
	return user, nil
}

func (s *PostgresStore) createSession(ctx context.Context, userID string) (string, error) {
	token := randomToken()
	if s.sessionTTL <= 0 {
		_, err := s.db.Exec(ctx, `INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, token, userID)
		return token, err
	}
	_, err := s.db.Exec(ctx, `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,now()+($3::bigint * interval '1 second'))`, token, userID, int64(s.sessionTTL.Seconds()))
	return token, err
}

func (s *PostgresStore) userByWhere(ctx context.Context, where string) (User, bool) {
	rows, err := s.db.Query(ctx, `SELECT id, account, name, role, plan, status, points, chats, images, avatar_url, created_at, last_active FROM users WHERE `+where)
	if err != nil {
		return User{}, false
	}
	defer rows.Close()
	if !rows.Next() {
		return User{}, false
	}
	user, err := scanUser(rows)
	return user, err == nil
}

func (s *PostgresStore) addPointsLogTx(ctx context.Context, tx pgx.Tx, userID string, typ string, amount int, sourceType string, sourceID string, remark string) (PointsLog, error) {
	var userName string
	var before int
	if err := tx.QueryRow(ctx, `SELECT name, points FROM users WHERE id=$1 FOR UPDATE`, userID).Scan(&userName, &before); err != nil {
		return PointsLog{}, err
	}
	after := before + amount
	if after < 0 {
		after = 0
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET points=$1 WHERE id=$2`, after, userID); err != nil {
		return PointsLog{}, err
	}
	item := PointsLog{ID: newID("points"), UserID: userID, UserName: userName, Type: typ, Amount: amount, BalanceBefore: before, BalanceAfter: after, SourceType: sourceType, SourceID: sourceID, Remark: remark}
	var createdAt time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO points_logs (id,user_id,user_name,type,amount,balance_before,balance_after,source_type,source_id,remark)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING created_at
	`, item.ID, item.UserID, item.UserName, item.Type, item.Amount, item.BalanceBefore, item.BalanceAfter, item.SourceType, item.SourceID, item.Remark).Scan(&createdAt); err != nil {
		return PointsLog{}, err
	}
	item.CreatedAt = timeString(createdAt)
	return item, nil
}

func scanUser(rows pgx.Rows) (User, error) {
	var item User
	var createdAt, lastActive time.Time
	err := rows.Scan(&item.ID, &item.Phone, &item.Name, &item.Role, &item.Plan, &item.Status, &item.Points, &item.Chats, &item.Images, &item.AvatarURL, &createdAt, &lastActive)
	item.CreatedAt = timeString(createdAt)
	item.LastActive = timeString(lastActive)
	return item, err
}

func modelSelectSQL() string {
	return `SELECT m.id, m.provider_id, COALESCE(pr.name,''), m.model_group, m.upstream_id, m.display_name, m.description, m.capabilities, m.enabled, m.visibility, m.default_role,
		m.sort_weight, m.sse, m.context_window, m.points_policy_id, COALESCE(p.name,''), m.rpm, m.tpm, m.max_concurrency, m.timeout_total_sec,
		m.image_size, m.image_quality, m.voice, m.audio_format, m.reasoning_effort, m.smoke_status, m.smoke_latency_ms, m.smoke_error,
		m.smoke_error_type, m.smoke_error_detail, m.health_status, m.health_text, m.calls_7d
		FROM models m
		LEFT JOIN providers pr ON pr.id=m.provider_id
		LEFT JOIN points_policies p ON p.id=m.points_policy_id`
}

func scanModels(rows pgx.Rows) []Model {
	items := []Model{}
	for rows.Next() {
		var item Model
		err := rows.Scan(&item.ID, &item.ProviderID, &item.ProviderName, &item.Group, &item.UpstreamID, &item.DisplayName, &item.Description, &item.Capabilities, &item.Enabled, &item.Visibility, &item.DefaultRole, &item.SortWeight, &item.SSE, &item.ContextWindow, &item.PointsPolicyID, &item.PointsPolicySummary, &item.RPM, &item.TPM, &item.MaxConcurrency, &item.TimeoutTotalSec, &item.ImageSize, &item.ImageQuality, &item.Voice, &item.AudioFormat, &item.ReasoningEffort, &item.SmokeStatus, &item.SmokeLatencyMs, &item.SmokeError, &item.SmokeErrorType, &item.SmokeErrorDetail, &item.HealthStatus, &item.HealthText, &item.Calls7d)
		if err == nil {
			items = append(items, item)
		}
	}
	return items
}

func slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		ok := r >= 'a' && r <= 'z' || r >= '0' && r <= '9'
		if ok {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return newID("item")
	}
	return out
}
