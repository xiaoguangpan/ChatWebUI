package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type testApp struct {
	server *httptest.Server
	store  *PostgresStore
	dbName string
}

func TestAuthRegisterLoginLogoutAndMe(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)

	unauthorizedRes, err := http.Get(app.server.URL + "/api/auth/me")
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, unauthorizedRes, http.StatusUnauthorized, "unauthenticated me")
	_ = unauthorizedRes.Body.Close()

	registerBody := `{"phone":"user1@example.com","password":"secret123","password_confirm":"secret123"}`
	res := postJSON(t, app.server.URL+"/api/auth/register", registerBody, "")
	expectStatus(t, res, http.StatusCreated, "register")
	var registered AuthResponse
	decodeJSON(t, res, &registered)
	if registered.Token == "" || registered.User.Phone != "user1@example.com" || registered.User.Points != 200 {
		t.Fatalf("unexpected register response: %+v", registered)
	}
	if registered.User.Name == "" || registered.User.Name == "用户.com" {
		t.Fatalf("unexpected generated nickname: %q", registered.User.Name)
	}

	loginRes := postJSON(t, app.server.URL+"/api/auth/login", `{"phone":"user1@example.com","password":"secret123"}`, "")
	expectStatus(t, loginRes, http.StatusOK, "login")
	var loggedIn AuthResponse
	decodeJSON(t, loginRes, &loggedIn)
	if loggedIn.Token == "" || loggedIn.User.ID != registered.User.ID {
		t.Fatalf("unexpected login response: %+v", loggedIn)
	}

	meRes := getWithToken(t, app.server.URL+"/api/auth/me", loggedIn.Token)
	expectStatus(t, meRes, http.StatusOK, "me")
	var me struct {
		User User `json:"user"`
	}
	decodeJSON(t, meRes, &me)
	if me.User.ID != registered.User.ID {
		t.Fatalf("me user id = %q", me.User.ID)
	}

	profileRes := patchJSON(t, app.server.URL+"/api/me", `{"name":"青岚"}`, loggedIn.Token)
	expectStatus(t, profileRes, http.StatusOK, "update profile")
	var profile struct {
		User User `json:"user"`
	}
	decodeJSON(t, profileRes, &profile)
	if profile.User.Name != "青岚" {
		t.Fatalf("profile name = %q", profile.User.Name)
	}

	changeRes := postJSON(t, app.server.URL+"/api/me/password", `{"current_password":"secret123","new_password":"secret456","password_confirm":"secret456"}`, loggedIn.Token)
	expectStatus(t, changeRes, http.StatusOK, "change password")
	_ = changeRes.Body.Close()

	reloginRes := postJSON(t, app.server.URL+"/api/auth/login", `{"phone":"user1@example.com","password":"secret456"}`, "")
	expectStatus(t, reloginRes, http.StatusOK, "relogin")
	_ = reloginRes.Body.Close()

	logoutRes := postJSON(t, app.server.URL+"/api/auth/logout", `{}`, loggedIn.Token)
	expectStatus(t, logoutRes, http.StatusOK, "logout")
	_ = logoutRes.Body.Close()

	meAfterLogout := getWithToken(t, app.server.URL+"/api/auth/me", loggedIn.Token)
	expectStatus(t, meAfterLogout, http.StatusUnauthorized, "me after logout")
	_ = meAfterLogout.Body.Close()
}

func TestAvatarUploadUsesLocalStorage(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	token, _ := loginToken(t, app, "demo@example.com", "demo123456")

	body := new(bytes.Buffer)
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("avatar", "avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0, 0, 0, 0})
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req, err := http.NewRequest(http.MethodPost, app.server.URL+"/api/me/avatar", body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, res, http.StatusOK, "avatar upload")
	var payload struct {
		User      User   `json:"user"`
		AvatarURL string `json:"avatar_url"`
	}
	decodeJSON(t, res, &payload)
	if payload.AvatarURL == "" || payload.User.AvatarURL != payload.AvatarURL {
		t.Fatalf("unexpected avatar response: %+v", payload)
	}
	avatarRes, err := http.Get(app.server.URL + payload.AvatarURL)
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, avatarRes, http.StatusOK, "avatar static file")
	_ = avatarRes.Body.Close()
}

func TestRequestBodyLimitsAreScopedByEndpoint(t *testing.T) {
	jsonReq, err := http.NewRequest(http.MethodPost, "/api/chat/stream", nil)
	if err != nil {
		t.Fatal(err)
	}
	jsonReq.Header.Set("Content-Type", "application/json")
	if got := requestBodyLimit(jsonReq); got != defaultJSONBodyLimit {
		t.Fatalf("json body limit = %d, want %d", got, defaultJSONBodyLimit)
	}

	multipartReq, err := http.NewRequest(http.MethodPost, "/api/files", nil)
	if err != nil {
		t.Fatal(err)
	}
	multipartReq.Header.Set("Content-Type", "multipart/form-data; boundary=test")
	if got := requestBodyLimit(multipartReq); got != multipartBodyLimit {
		t.Fatalf("multipart body limit = %d, want %d", got, multipartBodyLimit)
	}

	avatarReq, err := http.NewRequest(http.MethodPost, "/api/me/avatar", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := requestBodyLimit(avatarReq); got != avatarBodyLimit {
		t.Fatalf("avatar body limit = %d, want %d", got, avatarBodyLimit)
	}
}

func TestConfiguredModelsIncludeChatImageAndSpeech(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	token, _ := loginToken(t, app, "demo@example.com", "demo123456")

	for _, item := range []struct {
		kind string
		want string
	}{
		{kind: "chat", want: "chat"},
		{kind: "image", want: "image"},
		{kind: "tts", want: "speech"},
	} {
		res := getWithToken(t, app.server.URL+"/api/models/available?type="+item.kind, token)
		expectStatus(t, res, http.StatusOK, "available models")
		var payload struct {
			Models []Model `json:"models"`
		}
		decodeJSON(t, res, &payload)
		if len(payload.Models) == 0 {
			t.Fatalf("no models for %s", item.kind)
		}
		if !hasCapability(payload.Models[0], item.want) {
			t.Fatalf("first model for %s lacks %s capability: %+v", item.kind, item.want, payload.Models[0])
		}
	}
}

func TestImageRequestsOmitUnsetSize(t *testing.T) {
	payloads := make(chan map[string]any, 2)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/images/generations" {
			http.NotFound(w, r)
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		payloads <- payload
		writeJSON(w, http.StatusOK, map[string]any{"data": []any{map[string]any{"url": "https://example.com/image.png"}}})
	}))
	defer upstream.Close()

	client := NewModelClient(Config{})
	provider := Provider{ID: "test", BaseURL: upstream.URL, APIKey: "sk-test"}
	model := Model{ID: "model", ProviderID: "test", UpstreamID: "image-model", Capabilities: []string{"image"}}

	if _, err := client.GenerateImage(context.Background(), provider, model, ImageRequest{Prompt: "green valley", Count: 1}); err != nil {
		t.Fatal(err)
	}
	firstPayload := <-payloads
	if _, ok := firstPayload["size"]; ok {
		t.Fatalf("unexpected default image size in generation payload: %+v", firstPayload)
	}

	if _, err := client.SmokeTest(context.Background(), provider, model); err != nil {
		t.Fatal(err)
	}
	smokePayload := <-payloads
	if _, ok := smokePayload["size"]; ok {
		t.Fatalf("unexpected default image size in smoke payload: %+v", smokePayload)
	}
}

func TestUpstreamInvalidJSONIncludesBodyPreview(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: upstream format error"))
	}))
	defer upstream.Close()

	client := NewModelClient(Config{})
	provider := Provider{ID: "test", BaseURL: upstream.URL, APIKey: "sk-test"}
	model := Model{ID: "model", ProviderID: "test", UpstreamID: "chat-model", Capabilities: []string{"chat"}}

	_, err := client.CompleteChat(context.Background(), provider, model, "hello", nil)
	if err == nil {
		t.Fatal("expected invalid json error")
	}
	if !strings.Contains(err.Error(), "data: upstream format error") {
		t.Fatalf("expected upstream body preview in error, got %q", err.Error())
	}
}

func TestCompleteChatAcceptsEventStreamResponse(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"O\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"K\"}}],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer upstream.Close()

	client := NewModelClient(Config{})
	provider := Provider{ID: "test", BaseURL: upstream.URL, APIKey: "sk-test"}
	model := Model{ID: "model", ProviderID: "test", UpstreamID: "chat-model", Capabilities: []string{"chat"}}

	result, err := client.CompleteChat(context.Background(), provider, model, "hello", nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Text != "OK" || result.Usage.TokensIn != 1 || result.Usage.TokensOut != 1 {
		t.Fatalf("unexpected event stream result: %+v", result)
	}
}

func TestChatImageSpeechAndDashboardFlow(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	userToken, _ := loginToken(t, app, "demo@example.com", "demo123456")
	adminToken, _ := loginToken(t, app, "admin", "admin123456")

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/chat/completions":
			var payload struct {
				Model    string `json:"model"`
				Messages []struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"messages"`
			}
			_ = json.NewDecoder(r.Body).Decode(&payload)
			if payload.Model == "mimo-v2.5-tts" {
				if len(payload.Messages) == 0 || payload.Messages[len(payload.Messages)-1].Role != "assistant" {
					t.Fatalf("xiaomi tts payload must put text in assistant message: %+v", payload.Messages)
				}
				writeJSON(w, http.StatusOK, map[string]any{
					"choices": []any{map[string]any{"message": map[string]any{"audio": map[string]any{"data": "YXVkaW8=", "format": "mp3", "mime_type": "audio/mpeg"}}}},
				})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{
				"choices": []any{map[string]any{"message": map[string]any{"content": "Real API flow OK"}}},
				"usage":   map[string]any{"prompt_tokens": 10, "completion_tokens": 6},
			})
		case "/images/generations":
			writeJSON(w, http.StatusOK, map[string]any{"data": []any{map[string]any{"url": "https://example.com/image.png"}}})
		case "/audio/speech":
			w.Header().Set("Content-Type", "audio/mpeg")
			_, _ = w.Write([]byte("audio"))
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()

	baseURL := upstream.URL
	if _, err := app.store.PatchProvider("openai", PatchProviderRequest{BaseURL: &baseURL}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.PatchProvider("xiaomi-tts", PatchProviderRequest{BaseURL: &baseURL}); err != nil {
		t.Fatal(err)
	}

	body := `{"prompt":"Test PostgreSQL chat","messages":[{"role":"user","content":[{"type":"text","text":"Test PostgreSQL chat"}]}]}`
	res := postJSON(t, app.server.URL+"/api/chat/stream", body, userToken)
	expectStatus(t, res, http.StatusOK, "chat")
	raw := readAll(t, res)
	if !strings.Contains(raw, "event: meta") || !strings.Contains(raw, `"conversation_id"`) || !strings.Contains(raw, "event: delta") || !strings.Contains(raw, "event: done") {
		t.Fatalf("unexpected SSE body: %s", raw)
	}

	imageRes := postJSON(t, app.server.URL+"/api/images/generations", `{"prompt":"green valley","count":1}`, userToken)
	expectStatus(t, imageRes, http.StatusOK, "image")
	_ = imageRes.Body.Close()
	userGenerationsRes := getWithToken(t, app.server.URL+"/api/me/generations", userToken)
	expectStatus(t, userGenerationsRes, http.StatusOK, "user generations")
	var userGenerations struct {
		Generations []Generation `json:"generations"`
	}
	decodeJSON(t, userGenerationsRes, &userGenerations)
	if len(userGenerations.Generations) == 0 || userGenerations.Generations[0].Type != "image" {
		t.Fatalf("expected image generation in user history: %+v", userGenerations.Generations)
	}
	deleteGenerationRes := deleteWithToken(t, app.server.URL+"/api/me/generations/"+userGenerations.Generations[0].ID, userToken)
	expectStatus(t, deleteGenerationRes, http.StatusOK, "delete image generation")
	_ = deleteGenerationRes.Body.Close()
	afterDeleteGenerationsRes := getWithToken(t, app.server.URL+"/api/me/generations", userToken)
	expectStatus(t, afterDeleteGenerationsRes, http.StatusOK, "user generations after delete")
	var afterDeleteGenerations struct {
		Generations []Generation `json:"generations"`
	}
	decodeJSON(t, afterDeleteGenerationsRes, &afterDeleteGenerations)
	for _, generation := range afterDeleteGenerations.Generations {
		if generation.ID == userGenerations.Generations[0].ID {
			t.Fatalf("deleted image generation still in history: %+v", afterDeleteGenerations.Generations)
		}
	}

	speechRes := postJSON(t, app.server.URL+"/api/audio/speech", `{"text":"hello from ChatWebUI"}`, userToken)
	expectStatus(t, speechRes, http.StatusOK, "speech")
	_ = speechRes.Body.Close()

	dashboardRes := getWithToken(t, app.server.URL+"/api/admin/dashboard", adminToken)
	expectStatus(t, dashboardRes, http.StatusOK, "dashboard")
	var dashboard map[string]any
	decodeJSON(t, dashboardRes, &dashboard)
	if dashboard["summary"] == nil || dashboard["recent"] == nil {
		t.Fatalf("unexpected dashboard response: %+v", dashboard)
	}
}

func TestAnonymousChatLimit(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": "guest ok"}}},
		})
	}))
	defer upstream.Close()
	baseURL := upstream.URL
	if _, err := app.store.PatchProvider("openai", PatchProviderRequest{BaseURL: &baseURL}); err != nil {
		t.Fatal(err)
	}

	modelsRes, err := http.Get(app.server.URL + "/api/models/available?type=chat")
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, modelsRes, http.StatusOK, "anonymous available models")
	_ = modelsRes.Body.Close()

	client := http.Client{}
	for i := 0; i < 3; i++ {
		req, err := http.NewRequest(http.MethodPost, app.server.URL+"/api/chat/stream", strings.NewReader(`{"prompt":"hello guest"}`))
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-ChatWebUI-Guest-Id", app.dbName)
		res, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		expectStatus(t, res, http.StatusOK, "anonymous chat")
		_ = res.Body.Close()
	}
	req, err := http.NewRequest(http.MethodPost, app.server.URL+"/api/chat/stream", strings.NewReader(`{"prompt":"hello guest again"}`))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ChatWebUI-Guest-Id", app.dbName)
	res, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, res, http.StatusUnauthorized, "anonymous chat limit")
	_ = res.Body.Close()
}

func TestAdminProviderAndModelCRUD(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	adminToken, _ := loginToken(t, app, "admin", "admin123456")

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/chat/completions" {
			writeJSON(w, http.StatusOK, map[string]any{
				"choices": []any{map[string]any{"message": map[string]any{"content": "OK"}}},
				"usage":   map[string]any{"prompt_tokens": 1, "completion_tokens": 1},
			})
			return
		}
		if r.URL.Path != "/models" {
			http.NotFound(w, r)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"data": []any{
				map[string]any{"id": "demo-chat"},
				map[string]any{"id": "demo-image"},
			},
		})
	}))
	defer upstream.Close()

	discoverBody := fmt.Sprintf(`{"name":"Test Provider","short":"T","type":"openai_compatible","base_url":%q,"api_key":"sk-test","enabled":true,"remark":"test"}`, upstream.URL)
	discoverRes := postJSON(t, app.server.URL+"/api/admin/providers/discover-models", discoverBody, adminToken)
	expectStatus(t, discoverRes, http.StatusOK, "provider discover")
	var discovered struct {
		Models []DiscoveredModel `json:"models"`
	}
	decodeJSON(t, discoverRes, &discovered)
	if len(discovered.Models) != 2 || discovered.Models[0].ID != "demo-chat" {
		t.Fatalf("unexpected discovered models: %+v", discovered.Models)
	}

	providerBody := fmt.Sprintf(`{"name":"Test Provider","short":"T","type":"openai_compatible","base_url":%q,"api_key":"sk-test","enabled":true,"remark":"test","models":[{"upstream_id":"demo-chat","display_name":"Demo Chat","group":"demo","capabilities":["chat"],"context_window":8192}]}`, upstream.URL)
	providerRes := postJSON(t, app.server.URL+"/api/admin/providers", providerBody, adminToken)
	expectStatus(t, providerRes, http.StatusCreated, "provider create")
	var providerPayload struct {
		Provider Provider `json:"provider"`
		Models   []Model  `json:"models"`
	}
	decodeJSON(t, providerRes, &providerPayload)
	if providerPayload.Provider.ID == "" || providerPayload.Provider.KeyMasked == "" || providerPayload.Provider.APIKey != "" {
		t.Fatalf("unexpected provider: %+v", providerPayload.Provider)
	}
	if len(providerPayload.Models) != 1 || providerPayload.Models[0].UpstreamID != "demo-chat" {
		t.Fatalf("unexpected imported models: %+v", providerPayload.Models)
	}

	modelRes := postJSON(t, app.server.URL+"/api/admin/models", `{"provider_id":"`+providerPayload.Provider.ID+`","upstream_id":"demo-chat-2","display_name":"Demo Chat 2","group":"demo","capabilities":["chat"],"context_window":8192}`, adminToken)
	expectStatus(t, modelRes, http.StatusCreated, "model create")
	var modelPayload struct {
		Model Model `json:"model"`
	}
	decodeJSON(t, modelRes, &modelPayload)
	if modelPayload.Model.ProviderID != providerPayload.Provider.ID || modelPayload.Model.PointsPolicyID != "default_call" {
		t.Fatalf("unexpected model: %+v", modelPayload.Model)
	}

	policyRes := postJSON(t, app.server.URL+"/api/admin/points-policies", `{"id":"custom_chat","name":"Custom Chat","mode":"per_call","summary":"custom","per_chat":3,"per_image":10,"per_speech":2,"per_other":1,"enabled":true}`, adminToken)
	expectStatus(t, policyRes, http.StatusCreated, "policy create")
	var policyPayload struct {
		Policy PointsPolicy `json:"policy"`
	}
	decodeJSON(t, policyRes, &policyPayload)
	if policyPayload.Policy.ID != "custom_chat" || policyPayload.Policy.PerChat != 3 || policyPayload.Policy.PerImage != 10 {
		t.Fatalf("unexpected policy: %+v", policyPayload.Policy)
	}
	patchPolicyRes := patchJSON(t, app.server.URL+"/api/admin/points-policies/custom_chat", `{"summary":"updated","per_chat":4}`, adminToken)
	expectStatus(t, patchPolicyRes, http.StatusOK, "policy patch")
	_ = patchPolicyRes.Body.Close()

	imageModelRes := postJSON(t, app.server.URL+"/api/admin/models", `{"provider_id":"`+providerPayload.Provider.ID+`","upstream_id":"demo-image","display_name":"Demo Image","group":"demo","capabilities":["image"]}`, adminToken)
	expectStatus(t, imageModelRes, http.StatusCreated, "image model create")
	var imageModelPayload struct {
		Model Model `json:"model"`
	}
	decodeJSON(t, imageModelRes, &imageModelPayload)

	imageTokenPolicyRes := patchJSON(t, app.server.URL+"/api/admin/models/"+imageModelPayload.Model.ID, `{"points_policy_id":"default_token"}`, adminToken)
	expectStatus(t, imageTokenPolicyRes, http.StatusBadRequest, "image model cannot use token policy")
	_ = imageTokenPolicyRes.Body.Close()

	defaultDraftRes := postJSON(t, app.server.URL+"/api/admin/models/"+modelPayload.Model.ID+"/set-default", `{"role":"chat"}`, adminToken)
	expectStatus(t, defaultDraftRes, http.StatusBadRequest, "draft model cannot be default")
	_ = defaultDraftRes.Body.Close()
	visibility := "public"
	if _, err := app.store.PatchModel(modelPayload.Model.ID, PatchModelRequest{Visibility: &visibility}); err != nil {
		t.Fatal(err)
	}

	discoverSavedRes := postJSON(t, app.server.URL+"/api/admin/providers/"+providerPayload.Provider.ID+"/discover-models", `{}`, adminToken)
	expectStatus(t, discoverSavedRes, http.StatusOK, "saved provider discover")
	_ = discoverSavedRes.Body.Close()

	testProviderRes := postJSON(t, app.server.URL+"/api/admin/providers/"+providerPayload.Provider.ID+"/test-models", `{}`, adminToken)
	expectStatus(t, testProviderRes, http.StatusOK, "provider smoke test")
	var providerTested struct {
		Models []Model `json:"models"`
	}
	decodeJSON(t, testProviderRes, &providerTested)
	for _, testedModel := range providerTested.Models {
		if hasCapability(testedModel, "image") {
			t.Fatalf("provider smoke test should skip image models: %+v", providerTested.Models)
		}
	}

	testModelRes := postJSON(t, app.server.URL+"/api/admin/models/"+modelPayload.Model.ID+"/test", `{}`, adminToken)
	expectStatus(t, testModelRes, http.StatusOK, "model smoke test")
	var tested struct {
		Model Model `json:"model"`
	}
	decodeJSON(t, testModelRes, &tested)
	if tested.Model.SmokeStatus != "ok" || tested.Model.SmokeLatencyMs <= 0 {
		t.Fatalf("unexpected smoke test result: %+v", tested.Model)
	}

	deleteModelRes := deleteWithToken(t, app.server.URL+"/api/admin/models/"+modelPayload.Model.ID, adminToken)
	expectStatus(t, deleteModelRes, http.StatusOK, "model delete")
	_ = deleteModelRes.Body.Close()
	if _, ok := app.store.Model(modelPayload.Model.ID); ok {
		t.Fatalf("deleted model still exists: %s", modelPayload.Model.ID)
	}
}

func TestAdminUserDetailAndResetPassword(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	userToken, user := loginToken(t, app, "demo@example.com", "demo123456")
	adminToken, _ := loginToken(t, app, "admin", "admin123456")

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"choices": []any{map[string]any{"message": map[string]any{"content": "detail ok"}}},
			"usage":   map[string]any{"prompt_tokens": 2, "completion_tokens": 2},
		})
	}))
	defer upstream.Close()
	baseURL := upstream.URL
	if _, err := app.store.PatchProvider("openai", PatchProviderRequest{BaseURL: &baseURL}); err != nil {
		t.Fatal(err)
	}

	res := postJSON(t, app.server.URL+"/api/chat/stream", `{"prompt":"detail flow","messages":[{"role":"user","content":[{"type":"text","text":"detail flow"}]}]}`, userToken)
	expectStatus(t, res, http.StatusOK, "chat for detail")
	_ = readAll(t, res)

	detailRes := getWithToken(t, app.server.URL+"/api/admin/users/"+user.ID+"/detail", adminToken)
	expectStatus(t, detailRes, http.StatusOK, "user detail")
	var detail struct {
		User          User           `json:"user"`
		Conversations []Conversation `json:"conversations"`
		Generations   []Generation   `json:"generations"`
		PointsLogs    []PointsLog    `json:"points_logs"`
		LoginHistory  []LoginHistory `json:"login_history"`
	}
	decodeJSON(t, detailRes, &detail)
	if detail.User.ID != user.ID || len(detail.Conversations) == 0 || len(detail.Generations) == 0 || len(detail.PointsLogs) == 0 || len(detail.LoginHistory) == 0 {
		t.Fatalf("unexpected user detail: %+v", detail)
	}

	messagesRes := getWithToken(t, app.server.URL+"/api/admin/users/"+user.ID+"/conversations/"+detail.Conversations[0].ID+"/messages", adminToken)
	expectStatus(t, messagesRes, http.StatusOK, "admin conversation messages")
	var messagesPayload struct {
		Messages []Message `json:"messages"`
	}
	decodeJSON(t, messagesRes, &messagesPayload)
	if len(messagesPayload.Messages) < 2 {
		t.Fatalf("unexpected conversation messages: %+v", messagesPayload.Messages)
	}
	deletePairRes := deleteWithToken(t, app.server.URL+"/api/conversations/"+detail.Conversations[0].ID+"/messages/"+messagesPayload.Messages[1].ID, userToken)
	expectStatus(t, deletePairRes, http.StatusOK, "delete message pair")
	_ = deletePairRes.Body.Close()
	afterDeleteRes := getWithToken(t, app.server.URL+"/api/conversations/"+detail.Conversations[0].ID+"/messages", userToken)
	expectStatus(t, afterDeleteRes, http.StatusOK, "messages after pair delete")
	var afterDelete struct {
		Messages []Message `json:"messages"`
	}
	decodeJSON(t, afterDeleteRes, &afterDelete)
	if len(afterDelete.Messages) != 0 {
		t.Fatalf("expected message pair deleted, got %+v", afterDelete.Messages)
	}
	deleteConversationRes := deleteWithToken(t, app.server.URL+"/api/conversations/"+detail.Conversations[0].ID, userToken)
	expectStatus(t, deleteConversationRes, http.StatusOK, "delete conversation")
	_ = deleteConversationRes.Body.Close()

	resetRes := postJSON(t, app.server.URL+"/api/admin/users/"+user.ID+"/reset-password", `{"new_password":"newpass123","password_confirm":"newpass123"}`, adminToken)
	expectStatus(t, resetRes, http.StatusOK, "reset password")
	_ = resetRes.Body.Close()
	reloginRes := postJSON(t, app.server.URL+"/api/auth/login", `{"phone":"demo@example.com","password":"newpass123"}`, "")
	expectStatus(t, reloginRes, http.StatusOK, "login with reset password")
	_ = reloginRes.Body.Close()
}

func TestAdminRoutesRequireAdminRole(t *testing.T) {
	app := newTestApp(t)
	defer app.close(t)
	userToken, _ := loginToken(t, app, "demo@example.com", "demo123456")

	unauthorized, err := http.Get(app.server.URL + "/api/admin/dashboard")
	if err != nil {
		t.Fatal(err)
	}
	expectStatus(t, unauthorized, http.StatusUnauthorized, "admin without token")
	_ = unauthorized.Body.Close()

	forbidden := getWithToken(t, app.server.URL+"/api/admin/dashboard", userToken)
	expectStatus(t, forbidden, http.StatusForbidden, "admin with user token")
	_ = forbidden.Body.Close()
}

func newTestApp(t *testing.T) *testApp {
	t.Helper()
	dbName := "chatwebui_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	adminURL := firstNonEmpty(os.Getenv("POSTGRES_ADMIN_URL"), "postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable")
	admin, err := pgx.Connect(context.Background(), adminURL)
	if err != nil {
		t.Fatalf("connect postgres admin: %v", err)
	}
	if _, err := admin.Exec(context.Background(), `CREATE DATABASE `+pgx.Identifier{dbName}.Sanitize()+` OWNER chatwebui`); err != nil {
		t.Fatalf("create test database: %v", err)
	}
	_ = admin.Close(context.Background())

	cfg := Config{
		Host:               "127.0.0.1",
		Port:               "0",
		AllowedOrigins:     []string{"*"},
		StreamChunkDelay:   0,
		DatabaseURL:        fmt.Sprintf("postgres://chatwebui:chatwebui_dev_2026@127.0.0.1:5432/%s?sslmode=disable", dbName),
		AppSecret:          "test-secret",
		UploadDir:          t.TempDir(),
		AnonymousChatLimit: 3,
		AdminAccount:       "admin",
		AdminPassword:      "admin123456",
		SeedDemoUser:       true,
		SessionTTL:         168 * time.Hour,
	}
	srv := New(cfg)
	pgStore, ok := srv.store.(*PostgresStore)
	if !ok {
		t.Fatal("expected PostgresStore")
	}
	seedTestModels(pgStore)
	return &testApp{server: httptest.NewServer(srv.mux), store: pgStore, dbName: dbName}
}

func seedTestModels(store *PostgresStore) {
	store.AddProvider(Provider{
		ID:      "openai",
		Name:    "OpenAI",
		Short:   "O",
		Type:    "openai_compatible",
		BaseURL: "https://example.invalid/v1",
		APIKey:  "sk-test",
		Enabled: true,
	})
	store.AddProvider(Provider{
		ID:      "xiaomi-tts",
		Name:    "小米语音",
		Short:   "V",
		Type:    "openai_compatible",
		BaseURL: "https://example.invalid/v1",
		APIKey:  "sk-test",
		Enabled: true,
	})
	store.AddModel(Model{
		ID:             "openai-gpt-5-5",
		ProviderID:     "openai",
		Group:          "openai",
		UpstreamID:     "gpt-5.5",
		Capabilities:   []string{"chat"},
		Enabled:        true,
		Visibility:     "public",
		DefaultRole:    "chat",
		SortWeight:     300,
		PointsPolicyID: "default_call",
		ContextWindow:  128000,
	})
	store.AddModel(Model{
		ID:              "openai-gpt-image-2",
		ProviderID:      "openai",
		Group:           "openai",
		UpstreamID:      "gpt-image-2",
		Capabilities:    []string{"image"},
		Enabled:         true,
		Visibility:      "public",
		DefaultRole:     "image",
		SortWeight:      200,
		PointsPolicyID:  "default_call",
		TimeoutTotalSec: 180,
	})
	store.AddModel(Model{
		ID:              "xiaomi-tts",
		ProviderID:      "xiaomi-tts",
		Group:           "xiaomi",
		UpstreamID:      "mimo-v2.5-tts",
		Capabilities:    []string{"speech"},
		Enabled:         true,
		Visibility:      "public",
		DefaultRole:     "tts",
		SortWeight:      100,
		PointsPolicyID:  "default_call",
		Voice:           "茉莉",
		AudioFormat:     "mp3",
		TimeoutTotalSec: 60,
	})
}

func (app *testApp) close(t *testing.T) {
	t.Helper()
	app.server.Close()
	app.store.Close()
	adminURL := firstNonEmpty(os.Getenv("POSTGRES_ADMIN_URL"), "postgres://postgres@127.0.0.1:5432/postgres?sslmode=disable")
	admin, err := pgx.Connect(context.Background(), adminURL)
	if err != nil {
		return
	}
	defer admin.Close(context.Background())
	_, _ = admin.Exec(context.Background(), `DROP DATABASE IF EXISTS `+pgx.Identifier{app.dbName}.Sanitize()+` WITH (FORCE)`)
}

func loginToken(t *testing.T, app *testApp, account string, password string) (string, User) {
	t.Helper()
	res := postJSON(t, app.server.URL+"/api/auth/login", `{"phone":"`+account+`","password":"`+password+`"}`, "")
	expectStatus(t, res, http.StatusOK, "login token")
	var auth AuthResponse
	decodeJSON(t, res, &auth)
	if auth.Token == "" {
		t.Fatal("empty login token")
	}
	return auth.Token, auth.User
}

func getWithToken(t *testing.T, url string, token string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func postJSON(t *testing.T, url string, body string, token string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func patchJSON(t *testing.T, url string, body string, token string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func deleteWithToken(t *testing.T, url string, token string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodDelete, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func expectStatus(t *testing.T, res *http.Response, want int, label string) {
	t.Helper()
	if res.StatusCode != want {
		t.Fatalf("%s status = %d body = %s", label, res.StatusCode, readAll(t, res))
	}
}

func decodeJSON(t *testing.T, res *http.Response, target any) {
	t.Helper()
	defer res.Body.Close()
	if err := json.NewDecoder(res.Body).Decode(target); err != nil {
		t.Fatal(err)
	}
}

func readAll(t *testing.T, res *http.Response) string {
	t.Helper()
	defer res.Body.Close()
	buf := new(bytes.Buffer)
	if _, err := buf.ReadFrom(res.Body); err != nil {
		t.Fatal(err)
	}
	return buf.String()
}
