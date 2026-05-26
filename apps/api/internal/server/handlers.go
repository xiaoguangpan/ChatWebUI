package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	if req.PasswordConfirm != "" && req.Password != req.PasswordConfirm {
		badRequest(w, "passwords do not match")
		return
	}
	res, err := s.store.Register(req.Phone, req.Password)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	account := strings.TrimSpace(req.Phone)
	if err := s.rejectIfLoginBlocked(r, account); err != nil {
		writeError(w, http.StatusTooManyRequests, err.Error())
		return
	}
	res, err := s.store.Login(account, req.Password)
	if err != nil {
		s.recordLoginFailure(r, account)
		s.store.AddSystemLog("warn", "audit", fmt.Sprintf("login failed account=%s ip=%s", strings.TrimSpace(req.Phone), clientIP(r)))
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	s.clearLoginFailures(r, account)
	s.store.AddLoginHistory(res.User.ID, res.User.Phone, clientIP(r), r.UserAgent(), "ok", "login")
	s.store.AddSystemLog("info", "audit", fmt.Sprintf("login ok account=%s user=%s ip=%s", res.User.Phone, res.User.ID, clientIP(r)))
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleAuthMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": s.currentUser(r)})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user := s.currentUser(r)
	s.store.DeleteSession(bearerToken(r))
	s.store.AddSystemLog("info", "audit", fmt.Sprintf("logout user=%s account=%s ip=%s", user.ID, user.Phone, clientIP(r)))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAvailableModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	kind := r.URL.Query().Get("type")
	if kind == "" {
		kind = "chat"
	}
	if kind == "tts" {
		kind = "speech"
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": s.store.ListAvailableModels(kind, s.currentUser(r))})
}

func (s *Server) handleConversations(w http.ResponseWriter, r *http.Request) {
	user := s.currentUser(r)
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"conversations": s.store.ListConversations(user.ID)})
	case http.MethodPost:
		var req struct {
			Title string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, http.ErrBodyReadAfterClose) {
			badRequest(w, "invalid json body")
			return
		}
		conversation := s.store.AddConversation(user.ID, req.Title)
		writeJSON(w, http.StatusCreated, map[string]any{"conversation": conversation})
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleConversationItem(w http.ResponseWriter, r *http.Request) {
	user := s.currentUser(r)
	path := strings.TrimPrefix(r.URL.Path, "/api/conversations/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		notFound(w)
		return
	}
	conversationID := parts[0]
	if !s.conversationBelongsToUser(conversationID, user.ID) {
		notFound(w)
		return
	}
	if r.Method == http.MethodDelete {
		if len(parts) == 1 {
			if err := s.store.DeleteConversation(conversationID); err != nil {
				notFound(w)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
			return
		}
		if len(parts) == 3 && parts[1] == "messages" && parts[2] != "" {
			if err := s.store.DeleteMessagePair(conversationID, parts[2]); err != nil {
				notFound(w)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
			return
		}
		notFound(w)
		return
	}
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	if len(parts) > 1 && parts[1] == "messages" {
		writeJSON(w, http.StatusOK, map[string]any{"messages": s.store.Messages(conversationID)})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": s.store.Messages(conversationID)})
}

func (s *Server) handleImageGeneration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req ImageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	req.Prompt = strings.TrimSpace(req.Prompt)
	if req.Prompt == "" {
		badRequest(w, "prompt is required")
		return
	}
	if req.Count <= 0 {
		req.Count = 1
	}
	user := s.currentUser(r)
	model := s.chooseModel(req.ModelID, "image", user)
	if model.ID == "" {
		writeError(w, http.StatusBadRequest, "no available image model")
		return
	}
	provider, _ := s.store.Provider(model.ProviderID)
	requestID := fmt.Sprintf("img_%d", time.Now().UnixNano())
	expectedPoints := s.store.PointsForModel(model, req.Count)
	if expectedPoints > user.Points {
		writeError(w, http.StatusPaymentRequired, "insufficient points")
		return
	}
	upstreamCtx, cancel := context.WithTimeout(context.Background(), modelRequestTimeout(model, 4*time.Minute))
	defer cancel()
	start := time.Now()
	result, err := s.client.GenerateImage(upstreamCtx, provider, model, req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		s.store.MarkModelFailure(model.ID, classifyError(err), err.Error())
		s.recordGeneration(user, model, provider, requestID, "image", req.Prompt, "", nil, Usage{}, 0, latency, "err", classifyError(err), err.Error())
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	points := s.store.PointsForModel(model, len(result.URLs))
	if err := s.store.Charge(user.ID, points, "generation", requestID, "生图 · "+model.UpstreamID); err != nil {
		s.recordGeneration(user, model, provider, requestID, "image", req.Prompt, "", result.URLs, Usage{}, 0, latency, "err", "billing", err.Error())
		writeError(w, http.StatusPaymentRequired, err.Error())
		return
	}
	s.recordGeneration(user, model, provider, requestID, "image", req.Prompt, "", result.URLs, Usage{}, points, latency, "ok", "", "")
	s.store.MarkModelSuccess(model.ID, latency)
	writeJSON(w, http.StatusOK, ImageResponse{ID: requestID, ModelID: model.ID, ImageURLs: result.URLs, PointsCost: points, Status: "ok"})
}

func (s *Server) handleSpeech(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req SpeechRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	req.Text = strings.TrimSpace(req.Text)
	if req.Text == "" {
		badRequest(w, "text is required")
		return
	}
	user := s.currentUser(r)
	model := s.chooseModel(req.ModelID, "speech", user)
	provider, _ := s.store.Provider(model.ProviderID)
	requestID := fmt.Sprintf("tts_%d", time.Now().UnixNano())
	start := time.Now()
	result, err := s.client.Speak(r.Context(), provider, model, req)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		s.store.MarkModelFailure(model.ID, classifyError(err), err.Error())
		s.recordGeneration(user, model, provider, requestID, "tts", req.Text, "", nil, Usage{}, 0, latency, "err", classifyError(err), err.Error())
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	points := s.store.PointsForModel(model, 1)
	if err := s.store.Charge(user.ID, points, "generation", requestID, "语音朗读 · "+model.UpstreamID); err != nil {
		writeError(w, http.StatusPaymentRequired, err.Error())
		return
	}
	gen := s.recordGeneration(user, model, provider, requestID, "tts", req.Text, "", nil, Usage{}, points, latency, "ok", "", "")
	gen.AudioBase64 = result.AudioBase64
	gen.AudioFormat = result.Format
	s.store.UpdateGenerationAudio(gen.ID, result.AudioBase64, result.Format)
	dataURL := "data:" + result.MimeType + ";base64," + result.AudioBase64
	s.store.MarkModelSuccess(model.ID, latency)
	writeJSON(w, http.StatusOK, SpeechResponse{ID: requestID, ModelID: model.ID, Voice: envOr(req.Voice, model.Voice), Format: result.Format, MimeType: result.MimeType, AudioBase64: result.AudioBase64, DataURL: dataURL, PointsCost: points})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{"user": s.currentUser(r)})
		return
	}
	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	user, err := s.store.UpdateProfile(s.currentUser(r).ID, req)
	if err != nil {
		badRequest(w, err.Error())
		return
	}
	s.store.AddSystemLog("info", "audit", fmt.Sprintf("update profile user=%s", user.ID))
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	if req.NewPassword != req.PasswordConfirm {
		badRequest(w, "passwords do not match")
		return
	}
	if err := s.store.ChangePassword(s.currentUser(r).ID, req.CurrentPassword, req.NewPassword); err != nil {
		badRequest(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleUploadAvatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if err := r.ParseMultipartForm(avatarBodyLimit); err != nil {
		badRequest(w, "invalid multipart form")
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		badRequest(w, "avatar file is required")
		return
	}
	defer file.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(file, head)
	head = head[:n]
	contentType := http.DetectContentType(head)
	ext, ok := avatarExtension(contentType, header.Filename)
	if !ok {
		badRequest(w, "avatar must be png, jpeg, webp, or gif")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read avatar")
		return
	}

	user := s.currentUser(r)
	dir := filepath.Join(s.config.UploadDir, "avatars")
	if err := os.MkdirAll(dir, 0755); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create upload directory")
		return
	}
	name := fmt.Sprintf("%s_%d%s", user.ID, time.Now().UnixNano(), ext)
	path := filepath.Join(dir, name)
	dst, err := os.Create(path)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save avatar")
		return
	}
	defer dst.Close()
	limited := &io.LimitedReader{R: file, N: avatarFileLimit + 1}
	written, err := io.Copy(dst, limited)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save avatar")
		return
	}
	if written > avatarFileLimit {
		_ = dst.Close()
		_ = os.Remove(path)
		badRequest(w, "avatar must be smaller than 8MB")
		return
	}

	avatarURL := "/uploads/avatars/" + name
	updated, err := s.store.UpdateAvatar(user.ID, avatarURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": updated, "avatar_url": avatarURL})
}

func (s *Server) handleMyPoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"points": s.currentUser(r).Points})
}

func (s *Server) handleMyPointsLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user := s.currentUser(r)
	all := s.store.ListPointsLogs()
	items := []PointsLog{}
	for _, item := range all {
		if item.UserID == user.ID {
			items = append(items, item)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": items})
}

func (s *Server) handleMyGenerations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	user := s.currentUser(r)
	writeJSON(w, http.StatusOK, map[string]any{"generations": s.store.ListUserGenerations(user.ID)})
}

func (s *Server) handleMyGenerationItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/me/generations/"), "/")
	if id == "" {
		notFound(w)
		return
	}
	if err := s.store.DeleteUserGeneration(s.currentUser(r).ID, id); err != nil {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleAdminDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, s.store.Dashboard())
}

func (s *Server) handleAdminProviders(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"providers": s.store.ListProviders()})
	case http.MethodPost:
		var req CreateProviderRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		enabled := true
		if req.Enabled != nil {
			enabled = *req.Enabled
		}
		provider := s.store.AddProvider(Provider{
			Name:      strings.TrimSpace(req.Name),
			Short:     strings.TrimSpace(req.Short),
			Type:      strings.TrimSpace(req.Type),
			BaseURL:   strings.TrimRight(strings.TrimSpace(req.BaseURL), "/"),
			APIKey:    strings.TrimSpace(req.APIKey),
			KeyMasked: maskKey(req.APIKey),
			Enabled:   enabled,
			Remark:    strings.TrimSpace(req.Remark),
		})
		createdModels := []Model{}
		for _, modelReq := range req.Models {
			upstreamID := strings.TrimSpace(modelReq.UpstreamID)
			if upstreamID == "" {
				continue
			}
			model := s.store.AddModel(Model{
				ProviderID:    provider.ID,
				Group:         strings.TrimSpace(modelReq.Group),
				UpstreamID:    upstreamID,
				DisplayName:   strings.TrimSpace(modelReq.DisplayName),
				Capabilities:  normalizedCapabilities(modelReq.Capabilities),
				ContextWindow: modelReq.ContextWindow,
				Enabled:       true,
				Visibility:    "draft",
			})
			createdModels = append(createdModels, model)
		}
		if len(createdModels) > 0 {
			writeJSON(w, http.StatusCreated, map[string]any{"provider": provider, "models": createdModels})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"provider": provider})
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleAdminDiscoverModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req CreateProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	provider := Provider{
		Name:    strings.TrimSpace(req.Name),
		Type:    strings.TrimSpace(req.Type),
		BaseURL: strings.TrimRight(strings.TrimSpace(req.BaseURL), "/"),
		APIKey:  strings.TrimSpace(req.APIKey),
		Enabled: true,
	}
	models, err := s.client.ListModels(r.Context(), provider)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"models": models})
}

func (s *Server) handleAdminProviderItem(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/providers/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		notFound(w)
		return
	}
	providerID := parts[0]
	provider, ok := s.store.Provider(providerID)
	if !ok {
		notFound(w)
		return
	}
	if len(parts) > 1 {
		switch parts[1] {
		case "discover-models":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			models, err := s.client.ListModels(r.Context(), provider)
			if err != nil {
				s.store.AddSystemLog("warn", "model", fmt.Sprintf("discover models failed provider=%s error=%s", providerID, err.Error()))
				writeError(w, http.StatusBadGateway, err.Error())
				return
			}
			s.store.AddSystemLog("info", "model", fmt.Sprintf("discover models ok provider=%s count=%d", providerID, len(models)))
			writeJSON(w, http.StatusOK, map[string]any{"models": models})
		case "list-models":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			items := []Model{}
			for _, model := range s.store.ListModels() {
				if model.ProviderID == providerID {
					items = append(items, model)
				}
			}
			writeJSON(w, http.StatusOK, map[string]any{"models": items})
		case "test-models":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			items := []Model{}
			for _, model := range s.store.ListModels() {
				if model.ProviderID == providerID && !hasCapability(model, "image") {
					items = append(items, s.smokeTestModel(r.Context(), model))
				}
			}
			writeJSON(w, http.StatusOK, map[string]any{"models": items})
		default:
			notFound(w)
		}
		return
	}
	if r.Method == http.MethodPatch {
		var patch PatchProviderRequest
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		provider, err := s.store.PatchProvider(providerID, patch)
		if err != nil {
			notFound(w)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"provider": provider})
		return
	}
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"provider": provider})
}

func (s *Server) handleAdminModels(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"models": s.store.ListModels()})
	case http.MethodPost:
		var req CreateModelRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		if _, ok := s.store.Provider(req.ProviderID); !ok {
			badRequest(w, "provider not found")
			return
		}
		upstreamID := strings.TrimSpace(req.UpstreamID)
		if upstreamID == "" {
			badRequest(w, "upstream_id is required")
			return
		}
		model := s.store.AddModel(Model{
			ProviderID:    req.ProviderID,
			Group:         strings.TrimSpace(req.Group),
			UpstreamID:    upstreamID,
			DisplayName:   strings.TrimSpace(req.DisplayName),
			Capabilities:  normalizedCapabilities(req.Capabilities),
			ContextWindow: req.ContextWindow,
		})
		writeJSON(w, http.StatusCreated, map[string]any{"model": model})
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleAdminModelItem(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/models/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		notFound(w)
		return
	}
	modelID := parts[0]
	if len(parts) > 1 {
		switch parts[1] {
		case "test":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			model, ok := s.store.Model(modelID)
			if !ok {
				notFound(w)
				return
			}
			model = s.smokeTestModel(r.Context(), model)
			writeJSON(w, http.StatusOK, map[string]any{"model": model})
		case "set-default":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			var req struct {
				Role string `json:"role"`
			}
			_ = json.NewDecoder(r.Body).Decode(&req)
			model, err := s.store.SetDefaultModel(modelID, req.Role)
			if err != nil {
				badRequest(w, err.Error())
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"model": model})
		default:
			notFound(w)
		}
		return
	}
	if r.Method == http.MethodPatch {
		var patch PatchModelRequest
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		model, err := s.store.PatchModel(modelID, patch)
		if err != nil {
			if err.Error() == "model not found" {
				notFound(w)
			} else {
				badRequest(w, err.Error())
			}
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"model": model})
		return
	}
	if r.Method == http.MethodDelete {
		model, ok := s.store.Model(modelID)
		if !ok {
			notFound(w)
			return
		}
		if err := s.store.DeleteModel(modelID); err != nil {
			notFound(w)
			return
		}
		s.store.AddSystemLog("warn", "model", fmt.Sprintf("delete model provider=%s model=%s", model.ProviderID, model.UpstreamID))
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	model, ok := s.store.Model(modelID)
	if !ok {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"model": model})
}

func (s *Server) smokeTestModel(ctx context.Context, model Model) Model {
	provider, ok := s.store.Provider(model.ProviderID)
	if !ok {
		s.store.MarkModelFailure(model.ID, "not_found", "provider not found")
		updated, _ := s.store.Model(model.ID)
		return updated
	}
	latency, err := s.client.SmokeTest(ctx, provider, model)
	if err != nil {
		errorType := classifyError(err)
		s.store.MarkModelFailure(model.ID, errorType, err.Error())
		s.store.AddSystemLog("warn", "model", fmt.Sprintf("smoke test failed provider=%s model=%s error_type=%s error=%s", provider.ID, model.UpstreamID, errorType, err.Error()))
		updated, _ := s.store.Model(model.ID)
		return updated
	}
	s.store.MarkModelSuccess(model.ID, latency)
	s.store.AddSystemLog("info", "model", fmt.Sprintf("smoke test ok provider=%s model=%s latency_ms=%d", provider.ID, model.UpstreamID, latency))
	updated, _ := s.store.Model(model.ID)
	return updated
}

func (s *Server) handleAdminPointsPolicies(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"policies": s.store.ListPolicies()})
	case http.MethodPost:
		var policy PointsPolicy
		if err := json.NewDecoder(r.Body).Decode(&policy); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		created, err := s.store.AddPolicy(policy)
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		s.store.AddSystemLog("info", "audit", fmt.Sprintf("admin create points policy operator=%s policy=%s", s.currentUser(r).ID, created.ID))
		writeJSON(w, http.StatusCreated, map[string]any{"policy": created})
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleAdminPointsPolicyItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}
	id := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/admin/points-policies/"), "/")
	var patch PatchPolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		badRequest(w, "invalid json body")
		return
	}
	policy, err := s.store.PatchPolicy(id, patch)
	if err != nil {
		notFound(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"policy": policy})
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"users": s.store.ListUsers()})
	case http.MethodPost:
		var req CreateUserRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			badRequest(w, "invalid json body")
			return
		}
		user, err := s.store.AddUser(req)
		if err != nil {
			badRequest(w, err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"user": user})
	default:
		methodNotAllowed(w)
	}
}

func (s *Server) handleAdminUserItem(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/admin/users/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		notFound(w)
		return
	}
	userID := parts[0]
	if len(parts) > 1 {
		switch parts[1] {
		case "detail":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			user, ok := s.store.User(userID)
			if !ok {
				notFound(w)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"user":          user,
				"conversations": s.store.ListConversations(userID),
				"generations":   s.store.ListUserGenerations(userID),
				"points_logs":   s.store.ListUserPointsLogs(userID),
				"login_history": s.store.ListLoginHistory(userID),
			})
		case "conversations":
			if r.Method != http.MethodGet {
				methodNotAllowed(w)
				return
			}
			if len(parts) != 4 || parts[2] == "" || parts[3] != "messages" {
				notFound(w)
				return
			}
			if !s.conversationBelongsToUser(parts[2], userID) {
				notFound(w)
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"messages": s.store.Messages(parts[2])})
		case "adjust-points":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			var req AdjustPointsRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				badRequest(w, "invalid json body")
				return
			}
			log := s.store.AddPointsLog(userID, "admin", req.Amount, "admin", s.currentUser(r).ID, req.Remark)
			s.store.AddSystemLog("info", "audit", fmt.Sprintf("admin adjust points operator=%s user=%s amount=%d", s.currentUser(r).ID, userID, req.Amount))
			writeJSON(w, http.StatusOK, map[string]any{"log": log})
		case "change-plan":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			var req ChangePlanRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				badRequest(w, "invalid json body")
				return
			}
			user, err := s.store.ChangeUserPlan(userID, req.Plan)
			if err != nil {
				notFound(w)
				return
			}
			s.store.AddSystemLog("info", "audit", fmt.Sprintf("admin change plan operator=%s user=%s plan=%s", s.currentUser(r).ID, userID, req.Plan))
			writeJSON(w, http.StatusOK, map[string]any{"user": user})
		case "ban":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			user, err := s.store.SetUserStatus(userID, "banned")
			if err != nil {
				notFound(w)
				return
			}
			s.store.AddSystemLog("warn", "audit", fmt.Sprintf("admin ban user operator=%s user=%s", s.currentUser(r).ID, userID))
			writeJSON(w, http.StatusOK, map[string]any{"user": user})
		case "unban":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			user, err := s.store.SetUserStatus(userID, "active")
			if err != nil {
				notFound(w)
				return
			}
			s.store.AddSystemLog("info", "audit", fmt.Sprintf("admin unban user operator=%s user=%s", s.currentUser(r).ID, userID))
			writeJSON(w, http.StatusOK, map[string]any{"user": user})
		case "reset-password":
			if r.Method != http.MethodPost {
				methodNotAllowed(w)
				return
			}
			var req ResetPasswordRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				badRequest(w, "invalid json body")
				return
			}
			if req.PasswordConfirm != "" && req.NewPassword != req.PasswordConfirm {
				badRequest(w, "passwords do not match")
				return
			}
			if err := s.store.ResetPassword(userID, req.NewPassword); err != nil {
				badRequest(w, err.Error())
				return
			}
			s.store.AddSystemLog("warn", "audit", fmt.Sprintf("admin reset password operator=%s user=%s", s.currentUser(r).ID, userID))
			writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		default:
			notFound(w)
		}
		return
	}
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	if user, ok := s.store.User(userID); ok {
		writeJSON(w, http.StatusOK, map[string]any{"user": user})
		return
	}
	notFound(w)
}

func (s *Server) handleAdminGenerations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"generations": s.store.ListGenerations()})
}

func (s *Server) handleAdminPointsLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": s.store.ListPointsLogs()})
}

func (s *Server) handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"logs": s.store.ListSystemLogs()})
}

func (s *Server) handleUploads(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		methodNotAllowed(w)
		return
	}
	rel := strings.TrimPrefix(r.URL.Path, "/uploads/")
	if rel == "" {
		notFound(w)
		return
	}
	root, err := filepath.Abs(s.config.UploadDir)
	if err != nil {
		notFound(w)
		return
	}
	target, err := filepath.Abs(filepath.Join(root, filepath.Clean(rel)))
	if err != nil || target != root && !strings.HasPrefix(target, root+string(os.PathSeparator)) {
		notFound(w)
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, target)
}

func (s *Server) requireUser(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := s.authenticatedUser(r); !ok {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		next(w, r)
	}
}

func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := s.authenticatedUser(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "authentication required")
			return
		}
		if user.Role != "admin" {
			writeError(w, http.StatusForbidden, "admin permission required")
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request) string {
	for _, header := range []string{"X-Forwarded-For", "X-Real-IP"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value == "" {
			continue
		}
		if before, _, ok := strings.Cut(value, ","); ok {
			value = strings.TrimSpace(before)
		}
		if value != "" {
			return value
		}
	}
	if host, _, ok := strings.Cut(r.RemoteAddr, ":"); ok {
		return host
	}
	return r.RemoteAddr
}

func (s *Server) authenticatedUser(r *http.Request) (User, bool) {
	token := bearerToken(r)
	if token == "" {
		return User{}, false
	}
	user, ok := s.store.UserByToken(token)
	if !ok || user.Status != "active" {
		return User{}, false
	}
	return user, true
}

func (s *Server) currentUser(r *http.Request) User {
	user, _ := s.authenticatedUser(r)
	return user
}

func bearerToken(r *http.Request) string {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return ""
	}
	return strings.TrimSpace(header[7:])
}

func (s *Server) conversationBelongsToUser(conversationID string, userID string) bool {
	if conversationID == "" || userID == "" {
		return false
	}
	for _, item := range s.store.ListConversations(userID) {
		if item.ID == conversationID {
			return true
		}
	}
	return false
}

func avatarExtension(contentType string, filename string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/png":
		return ".png", true
	case "image/jpeg":
		return ".jpg", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp":
		return ext, true
	default:
		return "", false
	}
}

func normalizedCapabilities(values []string) []string {
	seen := map[string]bool{}
	items := []string{}
	for _, value := range values {
		capability := strings.TrimSpace(strings.ToLower(value))
		if capability == "" {
			continue
		}
		if capability == "tts" {
			capability = "speech"
		}
		if !seen[capability] {
			seen[capability] = true
			items = append(items, capability)
		}
	}
	if len(items) == 0 {
		return []string{"chat"}
	}
	return items
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": message})
}

func badRequest(w http.ResponseWriter, message string) {
	writeError(w, http.StatusBadRequest, message)
}

func notFound(w http.ResponseWriter) {
	writeError(w, http.StatusNotFound, "not found")
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}
