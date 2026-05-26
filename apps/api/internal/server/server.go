package server

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

type Config struct {
	Host               string
	Port               string
	AllowedOrigins     []string
	StreamChunkDelay   time.Duration
	DatabaseURL        string
	RedisAddr          string
	AppSecret          string
	UploadDir          string
	AnonymousChatLimit int
	AdminAccount       string
	AdminPassword      string
	AdminPasswordSet   bool
	SeedDemoUser       bool
	SessionTTL         time.Duration
}

type Server struct {
	config          Config
	mux             *http.ServeMux
	store           Store
	client          *ModelClient
	cache           *redis.Client
	anonymousMu     sync.Mutex
	anonymousCounts map[string]int
	loginMu         sync.Mutex
	loginFailures   map[string]loginFailure
}

type loginFailure struct {
	Count   int
	ResetAt time.Time
}

type ChatRequest struct {
	Prompt         string          `json:"prompt"`
	ModelID        string          `json:"model_id"`
	ConversationID string          `json:"conversation_id"`
	Messages       []ThreadMessage `json:"messages"`
}

type ThreadMessage struct {
	Role    string        `json:"role"`
	Content []MessagePart `json:"content"`
}

type MessagePart struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type StreamEvent struct {
	Type           string `json:"type"`
	Text           string `json:"text,omitempty"`
	ID             string `json:"id,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	Message        string `json:"message,omitempty"`
	Usage          *Usage `json:"usage,omitempty"`
}

func LoadConfig() Config {
	loadDotEnvFiles()

	host := os.Getenv("HOST")
	if host == "" {
		host = "127.0.0.1"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}

	// 同时兼容 CORS_ALLOWED_ORIGINS（列表）和旧版 CORS_ALLOWED_ORIGIN（单值）。
	// 默认覆盖常用 Vite 端口，避免开发端口变化时反复手动改 CORS。
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv == "" {
		originsEnv = os.Getenv("CORS_ALLOWED_ORIGIN")
	}
	if originsEnv == "" {
		originsEnv = strings.Join([]string{
			"http://127.0.0.1:5173",
			"http://127.0.0.1:5174",
			"http://127.0.0.1:5175",
			"http://127.0.0.1:5176",
			"http://localhost:5173",
			"http://localhost:5174",
			"http://localhost:5175",
			"http://localhost:5176",
		}, ",")
	}

	origins := make([]string, 0, 4)
	for _, o := range strings.Split(originsEnv, ",") {
		if trimmed := strings.TrimSpace(o); trimmed != "" {
			origins = append(origins, trimmed)
		}
	}

	adminPassword, adminPasswordSet := os.LookupEnv("ADMIN_PASSWORD")
	if strings.TrimSpace(adminPassword) == "" {
		adminPassword = defaultDevAdminPassword
		adminPasswordSet = false
	}

	sessionTTLHours := intEnv("SESSION_TTL_HOURS", 168)
	if sessionTTLHours < 0 {
		sessionTTLHours = 0
	}

	return Config{
		Host:               host,
		Port:               port,
		AllowedOrigins:     origins,
		StreamChunkDelay:   32 * time.Millisecond,
		DatabaseURL:        firstNonEmpty(os.Getenv("DATABASE_URL"), "postgres://chatwebui:chatwebui_dev_2026@127.0.0.1:5432/chatwebui?sslmode=disable"),
		RedisAddr:          firstNonEmpty(os.Getenv("REDIS_ADDR"), "127.0.0.1:6379"),
		AppSecret:          firstNonEmpty(os.Getenv("APP_SECRET"), "chatwebui-dev-secret-change-me"),
		UploadDir:          firstNonEmpty(os.Getenv("UPLOAD_DIR"), "apps/api/uploads"),
		AnonymousChatLimit: intEnv("ANONYMOUS_CHAT_LIMIT", 3),
		AdminAccount:       firstNonEmpty(os.Getenv("ADMIN_ACCOUNT"), "admin"),
		AdminPassword:      adminPassword,
		AdminPasswordSet:   adminPasswordSet,
		SeedDemoUser:       boolEnv("SEED_DEMO_USER", false),
		SessionTTL:         time.Duration(sessionTTLHours) * time.Hour,
	}
}

const defaultDevAdminPassword = "admin123456"

func (c Config) ValidateForServe() error {
	if !isPublicListenHost(c.Host) {
		return nil
	}
	if isWeakAppSecret(c.AppSecret) {
		return errors.New("APP_SECRET must be set to a long random value when HOST listens publicly")
	}
	if !c.AdminPasswordSet || isWeakAdminPassword(c.AdminPassword) {
		return errors.New("ADMIN_PASSWORD must be set to a non-default password with at least 10 characters when HOST listens publicly")
	}
	for _, origin := range c.AllowedOrigins {
		if origin == "*" {
			return errors.New("CORS_ALLOWED_ORIGINS cannot contain * when HOST listens publicly")
		}
	}
	return nil
}

func isPublicListenHost(host string) bool {
	host = strings.TrimSpace(host)
	return host == "" || host == "0.0.0.0" || host == "::" || host == "[::]"
}

func isWeakAdminPassword(password string) bool {
	password = strings.TrimSpace(password)
	if len(password) < 10 {
		return true
	}
	switch password {
	case defaultDevAdminPassword, "replace-with-a-strong-admin-password":
		return true
	default:
		return strings.Contains(strings.ToLower(password), "replace-with")
	}
}

func isWeakAppSecret(secret string) bool {
	secret = strings.TrimSpace(secret)
	if len(secret) < 32 {
		return true
	}
	switch secret {
	case "chatwebui-dev-secret-change-me", "change-me-to-a-long-random-secret", "replace-with-a-long-random-secret", "dev-only-please-change-to-a-long-random-secret":
		return true
	default:
		return false
	}
}

func intEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func boolEnv(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	switch value {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func loadDotEnvFiles() {
	for _, path := range []string{".env", "apps/api/.env"} {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, value, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			if key == "" || os.Getenv(key) != "" {
				continue
			}
			value = strings.TrimSpace(value)
			value = strings.Trim(value, `"'`)
			_ = os.Setenv(key, value)
		}
	}
}

func (c Config) isOriginAllowed(origin string) bool {
	if origin == "" {
		return false
	}
	for _, allowed := range c.AllowedOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

func (c Config) Addr() string {
	return c.Host + ":" + c.Port
}

func New(config Config) *Server {
	s := &Server{
		config:          config,
		mux:             http.NewServeMux(),
		anonymousCounts: map[string]int{},
		loginFailures:   map[string]loginFailure{},
	}
	s.store = NewStore(config)
	s.client = NewModelClient(config)
	s.cache = NewRedisClient(config)

	s.routes()
	return s
}

func (s *Server) ListenAndServe() error {
	return http.ListenAndServe(s.config.Addr(), s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", s.withCORS(s.handleHealthz))
	s.mux.HandleFunc("/uploads/", s.withCORS(s.handleUploads))
	s.mux.HandleFunc("/api/auth/register", s.withCORS(s.handleRegister))
	s.mux.HandleFunc("/api/auth/login", s.withCORS(s.handleLogin))
	s.mux.HandleFunc("/api/auth/me", s.withCORS(s.requireUser(s.handleAuthMe)))
	s.mux.HandleFunc("/api/auth/logout", s.withCORS(s.requireUser(s.handleLogout)))
	s.mux.HandleFunc("/api/chat/stream", s.withCORS(s.handleChatStream))
	s.mux.HandleFunc("/api/models/available", s.withCORS(s.handleAvailableModels))
	s.mux.HandleFunc("/api/conversations", s.withCORS(s.requireUser(s.handleConversations)))
	s.mux.HandleFunc("/api/conversations/", s.withCORS(s.requireUser(s.handleConversationItem)))
	s.mux.HandleFunc("/api/images/generations", s.withCORS(s.requireUser(s.handleImageGeneration)))
	s.mux.HandleFunc("/api/audio/speech", s.withCORS(s.requireUser(s.handleSpeech)))
	s.mux.HandleFunc("/api/me", s.withCORS(s.requireUser(s.handleMe)))
	s.mux.HandleFunc("/api/me/password", s.withCORS(s.requireUser(s.handleChangePassword)))
	s.mux.HandleFunc("/api/me/avatar", s.withCORS(s.requireUser(s.handleUploadAvatar)))
	s.mux.HandleFunc("/api/me/points", s.withCORS(s.requireUser(s.handleMyPoints)))
	s.mux.HandleFunc("/api/me/points/logs", s.withCORS(s.requireUser(s.handleMyPointsLogs)))
	s.mux.HandleFunc("/api/me/generations", s.withCORS(s.requireUser(s.handleMyGenerations)))
	s.mux.HandleFunc("/api/me/generations/", s.withCORS(s.requireUser(s.handleMyGenerationItem)))
	s.mux.HandleFunc("/api/admin/dashboard", s.withCORS(s.requireAdmin(s.handleAdminDashboard)))
	s.mux.HandleFunc("/api/admin/providers/discover-models", s.withCORS(s.requireAdmin(s.handleAdminDiscoverModels)))
	s.mux.HandleFunc("/api/admin/providers", s.withCORS(s.requireAdmin(s.handleAdminProviders)))
	s.mux.HandleFunc("/api/admin/providers/", s.withCORS(s.requireAdmin(s.handleAdminProviderItem)))
	s.mux.HandleFunc("/api/admin/models", s.withCORS(s.requireAdmin(s.handleAdminModels)))
	s.mux.HandleFunc("/api/admin/models/", s.withCORS(s.requireAdmin(s.handleAdminModelItem)))
	s.mux.HandleFunc("/api/admin/points-policies", s.withCORS(s.requireAdmin(s.handleAdminPointsPolicies)))
	s.mux.HandleFunc("/api/admin/points-policies/", s.withCORS(s.requireAdmin(s.handleAdminPointsPolicyItem)))
	s.mux.HandleFunc("/api/admin/users", s.withCORS(s.requireAdmin(s.handleAdminUsers)))
	s.mux.HandleFunc("/api/admin/users/", s.withCORS(s.requireAdmin(s.handleAdminUserItem)))
	s.mux.HandleFunc("/api/admin/generations", s.withCORS(s.requireAdmin(s.handleAdminGenerations)))
	s.mux.HandleFunc("/api/admin/points-log", s.withCORS(s.requireAdmin(s.handleAdminPointsLog)))
	s.mux.HandleFunc("/api/admin/logs", s.withCORS(s.requireAdmin(s.handleAdminLogs)))
}

func (s *Server) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if s.config.isOriginAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-ChatWebUI-Guest-Id")
		w.Header().Set("X-Content-Type-Options", "nosniff")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Body != nil {
			if limit := requestBodyLimit(r); limit > 0 {
				r.Body = http.MaxBytesReader(w, r.Body, limit)
			}
		}

		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next(recorder, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			userID := "-"
			if user, ok := s.authenticatedUser(r); ok {
				userID = user.ID
			}
			s.store.AddSystemLog("info", "access", fmt.Sprintf("method=%s path=%s status=%d duration_ms=%d ip=%s user=%s ua=%q", r.Method, r.URL.Path, recorder.status, time.Since(start).Milliseconds(), clientIP(r), userID, r.UserAgent()))
		}
	}
}

const (
	defaultJSONBodyLimit = 4 << 20
	multipartBodyLimit   = 25 << 20
	avatarBodyLimit      = 10 << 20
	avatarFileLimit      = 8 << 20
)

func requestBodyLimit(r *http.Request) int64 {
	switch r.Method {
	case http.MethodPost, http.MethodPatch, http.MethodPut:
	default:
		return 0
	}
	if r.URL.Path == "/api/me/avatar" {
		return avatarBodyLimit
	}
	contentType := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
	if strings.HasPrefix(contentType, "multipart/form-data") {
		return multipartBodyLimit
	}
	return defaultJSONBodyLimit
}

func (s *Server) rejectIfLoginBlocked(r *http.Request, account string) error {
	key := loginFailureKey(r, account)
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if s.cache != nil {
		count, err := s.cache.Get(ctx, key).Int()
		if err == nil && count >= 10 {
			return errors.New("too many failed login attempts, please try again later")
		}
	}
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	item, ok := s.loginFailures[key]
	if !ok || time.Now().After(item.ResetAt) {
		delete(s.loginFailures, key)
		return nil
	}
	if item.Count >= 10 {
		return errors.New("too many failed login attempts, please try again later")
	}
	return nil
}

func (s *Server) recordLoginFailure(r *http.Request, account string) {
	key := loginFailureKey(r, account)
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if s.cache != nil {
		if count, err := s.cache.Incr(ctx, key).Result(); err == nil {
			if count == 1 {
				_ = s.cache.Expire(ctx, key, 15*time.Minute).Err()
			}
			return
		}
	}
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	item := s.loginFailures[key]
	if time.Now().After(item.ResetAt) {
		item = loginFailure{ResetAt: time.Now().Add(15 * time.Minute)}
	}
	item.Count++
	s.loginFailures[key] = item
}

func (s *Server) clearLoginFailures(r *http.Request, account string) {
	key := loginFailureKey(r, account)
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if s.cache != nil {
		_ = s.cache.Del(ctx, key).Err()
	}
	s.loginMu.Lock()
	delete(s.loginFailures, key)
	s.loginMu.Unlock()
}

func loginFailureKey(r *http.Request, account string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(account)) + "|" + clientIP(r)))
	return "login_fail:" + hex.EncodeToString(sum[:])
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "database": "postgresql", "redis": redisHealth(s.cache)})
}

func (s *Server) handleChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	user, authenticated := s.authenticatedUser(r)
	if !authenticated {
		if err := s.allowAnonymousChat(r); err != nil {
			writeError(w, http.StatusUnauthorized, err.Error())
			return
		}
	}
	requestID := fmt.Sprintf("chat_%d", time.Now().UnixNano())
	conversationID := ""
	if authenticated {
		var err error
		conversationID, err = s.ensureChatConversation(user, &req)
		if err != nil {
			_ = writeSSE(w, flusher, StreamEvent{Type: "error", ID: requestID, Message: err.Error()})
			return
		}
	}
	if err := writeSSE(w, flusher, StreamEvent{Type: "meta", ID: requestID, ConversationID: conversationID}); err != nil {
		return
	}

	var result ChatCompletionResult
	var err error
	if authenticated {
		result, err = s.completeChat(r.Context(), user, req, requestID)
	} else {
		result, err = s.completeAnonymousChat(r.Context(), req)
	}
	if err != nil {
		_ = writeSSE(w, flusher, StreamEvent{Type: "error", ID: requestID, Message: err.Error()})
		return
	}
	answer := result.Text
	for _, chunk := range splitChunks(answer, 4) {
		if err := sleepOrCancel(r.Context(), s.config.StreamChunkDelay); err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("stream cancelled: %v", err)
			}
			return
		}

		if err := writeSSE(w, flusher, StreamEvent{Type: "delta", Text: chunk}); err != nil {
			return
		}
	}

	_ = writeSSE(w, flusher, StreamEvent{Type: "usage", ID: requestID, Usage: &result.Usage})
	_ = writeSSE(w, flusher, StreamEvent{Type: "done", ID: requestID})
}

func (s *Server) ensureChatConversation(user User, req *ChatRequest) (string, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = lastUserText(req.Messages)
	}
	if prompt == "" {
		return "", errors.New("prompt is required")
	}
	req.Prompt = prompt
	req.ConversationID = strings.TrimSpace(req.ConversationID)
	if req.ConversationID != "" {
		if !s.conversationBelongsToUser(req.ConversationID, user.ID) {
			return "", errors.New("conversation not found")
		}
		return req.ConversationID, nil
	}
	conversation := s.store.AddConversation(user.ID, truncateTitle(prompt))
	req.ConversationID = conversation.ID
	return conversation.ID, nil
}

func (s *Server) allowAnonymousChat(r *http.Request) error {
	limit := s.config.AnonymousChatLimit
	if limit <= 0 {
		return errors.New("authentication required")
	}
	key := "anon_chat:" + anonymousSessionID(r)
	ctx, cancel := context.WithTimeout(r.Context(), 500*time.Millisecond)
	defer cancel()
	if s.cache != nil {
		count, err := s.cache.Incr(ctx, key).Result()
		if err == nil {
			_ = s.cache.Expire(ctx, key, 24*time.Hour).Err()
			if int(count) > limit {
				return fmt.Errorf("anonymous chat limit reached, please login or register")
			}
			return nil
		}
	}
	s.anonymousMu.Lock()
	defer s.anonymousMu.Unlock()
	s.anonymousCounts[key]++
	if s.anonymousCounts[key] > limit {
		return fmt.Errorf("anonymous chat limit reached, please login or register")
	}
	return nil
}

func anonymousSessionID(r *http.Request) string {
	guestID := strings.TrimSpace(r.Header.Get("X-ChatWebUI-Guest-Id"))
	if guestID != "" {
		return guestID
	}
	return clientIP(r) + ":" + r.UserAgent()
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, event StreamEvent) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, payload); err != nil {
		return err
	}

	flusher.Flush()
	return nil
}

func lastUserText(messages []ThreadMessage) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}

		var builder strings.Builder
		for _, part := range messages[i].Content {
			if part.Type == "text" {
				builder.WriteString(part.Text)
			}
		}

		return strings.TrimSpace(builder.String())
	}

	return ""
}

func splitChunks(text string, size int) []string {
	if size <= 0 {
		size = 1
	}

	runes := []rune(text)
	chunks := make([]string, 0, len(runes)/size+1)
	for start := 0; start < len(runes); start += size {
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
	}

	return chunks
}

func sleepOrCancel(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
