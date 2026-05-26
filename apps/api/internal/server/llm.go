package server

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type ModelClient struct {
	config Config
	client *http.Client
}

type ChatCompletionResult struct {
	Text  string
	Usage Usage
}

type ImageGenerationResult struct {
	URLs []string
}

type SpeechResult struct {
	AudioBase64 string
	Format      string
	MimeType    string
}

func NewModelClient(config Config) *ModelClient {
	return &ModelClient{
		config: config,
		client: &http.Client{},
	}
}

func upstreamBodyPreview(body []byte) string {
	text := strings.TrimSpace(string(body))
	if text == "" {
		return "<empty>"
	}
	runes := []rune(text)
	if len(runes) > 2000 {
		return string(runes[:2000]) + "..."
	}
	return text
}

func (s *Server) completeChat(ctx context.Context, user User, req ChatRequest, requestID string) (ChatCompletionResult, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = lastUserText(req.Messages)
	}
	if prompt == "" {
		return ChatCompletionResult{}, errors.New("prompt is required")
	}
	if req.ConversationID != "" && !s.conversationBelongsToUser(req.ConversationID, user.ID) {
		return ChatCompletionResult{}, errors.New("conversation not found")
	}
	requestMessages := req.Messages
	storedMessages := []Message{}
	if req.ConversationID != "" {
		storedMessages = s.store.Messages(req.ConversationID)
		req.Messages = append(storedThreadMessages(storedMessages), req.Messages...)
	}

	model := s.chooseModel(req.ModelID, "chat", user)
	if model.ID == "" {
		return ChatCompletionResult{}, errors.New("no available chat model")
	}
	provider, _ := s.store.Provider(model.ProviderID)
	start := time.Now()
	result, err := s.client.CompleteChat(ctx, provider, model, prompt, req.Messages)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		s.store.MarkModelFailure(model.ID, classifyError(err), err.Error())
		s.recordGeneration(user, model, provider, requestID, "chat", prompt, "", nil, Usage{}, 0, latency, "err", classifyError(err), err.Error())
		return ChatCompletionResult{}, err
	}

	tokenUnits := result.Usage.TokensIn + result.Usage.TokensOut
	if tokenUnits <= 0 {
		estimated := estimateUsage(prompt, result.Text)
		tokenUnits = estimated.TokensIn + estimated.TokensOut
	}
	points := s.store.PointsForModel(model, tokenUnits)
	if err := s.store.Charge(user.ID, points, "generation", requestID, "对话 · "+model.UpstreamID); err != nil {
		return ChatCompletionResult{}, err
	}
	result.Usage.PointsCost = points
	conversationID := req.ConversationID
	if conversationID == "" {
		conversation := s.store.AddConversation(user.ID, truncateTitle(prompt))
		conversationID = conversation.ID
	}
	now := time.Now().Format(time.RFC3339)
	if len(storedMessages) == 0 {
		for _, message := range previousThreadMessages(requestMessages, prompt) {
			s.store.AddMessage(Message{ConversationID: conversationID, Role: message.Role, ContentMarkdown: threadMessageText(message), CreatedAt: now})
		}
	}
	s.store.AddMessage(Message{ConversationID: conversationID, Role: "user", ContentMarkdown: prompt, CreatedAt: now})
	s.store.AddMessage(Message{ConversationID: conversationID, Role: "assistant", ContentMarkdown: result.Text, ModelID: model.ID, ProviderID: provider.ID, TokensIn: result.Usage.TokensIn, TokensOut: result.Usage.TokensOut, PointsCost: points, CreatedAt: now})
	s.recordGeneration(user, model, provider, requestID, "chat", prompt, result.Text, nil, result.Usage, points, latency, "ok", "", "")
	s.store.MarkModelSuccess(model.ID, latency)
	return result, nil
}

func (s *Server) completeAnonymousChat(ctx context.Context, req ChatRequest) (ChatCompletionResult, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		prompt = lastUserText(req.Messages)
	}
	if prompt == "" {
		return ChatCompletionResult{}, errors.New("prompt is required")
	}
	model := s.chooseModel(req.ModelID, "chat", User{})
	if model.ID == "" {
		return ChatCompletionResult{}, errors.New("no available chat model")
	}
	provider, _ := s.store.Provider(model.ProviderID)
	start := time.Now()
	result, err := s.client.CompleteChat(ctx, provider, model, prompt, req.Messages)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		s.store.MarkModelFailure(model.ID, classifyError(err), err.Error())
		return ChatCompletionResult{}, err
	}
	result.Usage.PointsCost = 0
	s.store.MarkModelSuccess(model.ID, latency)
	return result, nil
}

func (c *ModelClient) CompleteChat(ctx context.Context, provider Provider, model Model, prompt string, messages []ThreadMessage) (ChatCompletionResult, error) {
	apiKey := provider.APIKey
	if provider.BaseURL == "" || apiKey == "" {
		return ChatCompletionResult{}, errors.New("provider base_url or api_key is not configured")
	}

	payloadMessages := make([]map[string]string, 0, len(messages)+1)
	for _, msg := range messages {
		content := threadMessageText(msg)
		if content == "" {
			continue
		}
		role := msg.Role
		if role != "system" && role != "assistant" && role != "user" {
			role = "user"
		}
		payloadMessages = append(payloadMessages, map[string]string{"role": role, "content": content})
	}
	if len(payloadMessages) == 0 {
		payloadMessages = append(payloadMessages, map[string]string{"role": "user", "content": prompt})
	}

	payload := map[string]any{
		"model":    model.UpstreamID,
		"messages": payloadMessages,
	}
	if model.ReasoningEffort != "" {
		payload["reasoning_effort"] = model.ReasoningEffort
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return ChatCompletionResult{}, err
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return ChatCompletionResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.client.Do(req)
	if err != nil {
		return ChatCompletionResult{}, err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return ChatCompletionResult{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return ChatCompletionResult{}, fmt.Errorf("upstream chat failed: %s %s", res.Status, string(resBody))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			Text string `json:"text"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		if text, usage, ok, streamErr := parseChatEventStream(resBody); ok {
			if streamErr != nil {
				return ChatCompletionResult{}, fmt.Errorf("upstream chat returned invalid event stream: %w; body=%s", streamErr, upstreamBodyPreview(resBody))
			}
			if usage.TokensIn == 0 && usage.TokensOut == 0 {
				usage = estimateUsage(prompt, text)
			}
			return ChatCompletionResult{Text: text, Usage: usage}, nil
		}
		return ChatCompletionResult{}, fmt.Errorf("upstream chat returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
	}
	if len(parsed.Choices) == 0 {
		return ChatCompletionResult{}, errors.New("upstream chat returned no choices")
	}
	text := parsed.Choices[0].Message.Content
	if text == "" {
		text = parsed.Choices[0].Text
	}
	if text == "" {
		return ChatCompletionResult{}, errors.New("upstream chat returned empty content")
	}
	usage := Usage{TokensIn: parsed.Usage.PromptTokens, TokensOut: parsed.Usage.CompletionTokens}
	if usage.TokensIn == 0 && usage.TokensOut == 0 {
		usage = estimateUsage(prompt, text)
	}
	return ChatCompletionResult{Text: text, Usage: usage}, nil
}

func parseChatEventStream(body []byte) (string, Usage, bool, error) {
	textParts := []string{}
	usage := Usage{}
	sawEvent := false
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		sawEvent = true
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
				Text string `json:"text"`
			} `json:"choices"`
			Usage struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return "", Usage{}, true, err
		}
		if chunk.Usage.PromptTokens > 0 || chunk.Usage.CompletionTokens > 0 {
			usage = Usage{TokensIn: chunk.Usage.PromptTokens, TokensOut: chunk.Usage.CompletionTokens}
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				textParts = append(textParts, choice.Delta.Content)
			} else if choice.Message.Content != "" {
				textParts = append(textParts, choice.Message.Content)
			} else if choice.Text != "" {
				textParts = append(textParts, choice.Text)
			}
		}
	}
	if !sawEvent {
		return "", Usage{}, false, nil
	}
	text := strings.TrimSpace(strings.Join(textParts, ""))
	if text == "" {
		return "", Usage{}, true, errors.New("upstream chat event stream returned no content")
	}
	return text, usage, true, nil
}

func (c *ModelClient) ListModels(ctx context.Context, provider Provider) ([]DiscoveredModel, error) {
	if provider.BaseURL == "" || provider.APIKey == "" {
		return nil, errors.New("provider base_url or api_key is not configured")
	}
	url := strings.TrimRight(provider.BaseURL, "/") + "/models"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	req.Header.Set("Accept", "application/json")
	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream models failed: %s %s", res.Status, string(resBody))
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return nil, fmt.Errorf("upstream models returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
	}
	items := []DiscoveredModel{}
	seen := map[string]bool{}
	for _, item := range parsed.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		items = append(items, DiscoveredModel{
			ID:            id,
			DisplayName:   id,
			Group:         modelGroupFromID(id),
			Capabilities:  capabilitiesFromModelID(id),
			ContextWindow: contextWindowFromModelID(id),
		})
	}
	if len(items) == 0 {
		return nil, errors.New("upstream models returned no model data")
	}
	return items, nil
}

func (c *ModelClient) GenerateImage(ctx context.Context, provider Provider, model Model, req ImageRequest) (ImageGenerationResult, error) {
	apiKey := provider.APIKey
	if provider.BaseURL == "" || apiKey == "" {
		return ImageGenerationResult{}, errors.New("provider base_url or api_key is not configured")
	}

	count := req.Count
	if count <= 0 {
		count = 1
	}
	payload := map[string]any{
		"model":  model.UpstreamID,
		"prompt": req.Prompt,
		"n":      count,
	}
	if size := firstNonEmpty(req.Size, model.ImageSize); size != "" {
		payload["size"] = size
	}
	if quality := envOr(req.Quality, model.ImageQuality); quality != "" {
		payload["quality"] = quality
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return ImageGenerationResult{}, err
	}

	url := strings.TrimRight(provider.BaseURL, "/") + "/images/generations"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return ImageGenerationResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	res, err := c.client.Do(httpReq)
	if err != nil {
		return ImageGenerationResult{}, err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return ImageGenerationResult{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return ImageGenerationResult{}, fmt.Errorf("upstream image failed: %s %s", res.Status, string(resBody))
	}
	var parsed struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return ImageGenerationResult{}, fmt.Errorf("upstream image returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
	}
	urls := []string{}
	for _, item := range parsed.Data {
		if item.URL != "" {
			urls = append(urls, item.URL)
		} else if item.B64JSON != "" {
			urls = append(urls, "data:image/png;base64,"+item.B64JSON)
		}
	}
	if len(urls) == 0 {
		return ImageGenerationResult{}, errors.New("upstream image returned no image data")
	}
	return ImageGenerationResult{URLs: urls}, nil
}

func (c *ModelClient) Speak(ctx context.Context, provider Provider, model Model, req SpeechRequest) (SpeechResult, error) {
	apiKey := provider.APIKey
	format := envOr(req.Format, envOr(model.AudioFormat, "mp3"))
	voice := envOr(req.Voice, envOr(model.Voice, "茉莉"))
	if provider.BaseURL == "" || apiKey == "" {
		return SpeechResult{}, errors.New("provider base_url or api_key is not configured")
	}
	if useChatCompletionsSpeech(provider, model) {
		return c.speakViaChatCompletions(ctx, provider, model, req.Text, voice, format)
	}
	return c.speakViaAudioSpeech(ctx, provider, model, req.Text, voice, format)
}

func (c *ModelClient) speakViaAudioSpeech(ctx context.Context, provider Provider, model Model, text string, voice string, format string) (SpeechResult, error) {
	payload := map[string]any{
		"model":           model.UpstreamID,
		"input":           text,
		"voice":           voice,
		"response_format": format,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return SpeechResult{}, err
	}
	url := strings.TrimRight(provider.BaseURL, "/") + "/audio/speech"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return SpeechResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	res, err := c.client.Do(httpReq)
	if err != nil {
		return SpeechResult{}, err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if err != nil {
		return SpeechResult{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return SpeechResult{}, fmt.Errorf("upstream speech failed: %s %s", res.Status, string(resBody))
	}
	contentType := res.Header.Get("Content-Type")
	if strings.Contains(contentType, "json") {
		var parsed struct {
			Audio    string `json:"audio"`
			B64JSON  string `json:"b64_json"`
			Data     string `json:"data"`
			Format   string `json:"format"`
			MimeType string `json:"mime_type"`
		}
		if err := json.Unmarshal(resBody, &parsed); err != nil {
			return SpeechResult{}, fmt.Errorf("upstream speech returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
		}
		audio := firstNonEmpty(parsed.Audio, parsed.B64JSON, parsed.Data)
		if audio == "" {
			return SpeechResult{}, errors.New("upstream speech returned no audio data")
		}
		return SpeechResult{AudioBase64: stripDataURL(audio), Format: envOr(parsed.Format, format), MimeType: envOr(parsed.MimeType, mimeForAudio(format))}, nil
	}
	return SpeechResult{AudioBase64: base64.StdEncoding.EncodeToString(resBody), Format: format, MimeType: envOr(contentType, mimeForAudio(format))}, nil
}

func (c *ModelClient) speakViaChatCompletions(ctx context.Context, provider Provider, model Model, text string, voice string, format string) (SpeechResult, error) {
	payload := map[string]any{
		"model": model.UpstreamID,
		"messages": []map[string]string{
			{"role": "assistant", "content": text},
		},
		"modalities": []string{"text", "audio"},
		"audio": map[string]string{
			"voice":  voice,
			"format": format,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return SpeechResult{}, err
	}
	url := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return SpeechResult{}, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	res, err := c.client.Do(httpReq)
	if err != nil {
		return SpeechResult{}, err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
	if err != nil {
		return SpeechResult{}, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return SpeechResult{}, fmt.Errorf("upstream speech failed: %s %s", res.Status, string(resBody))
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Audio struct {
					Data     string `json:"data"`
					Format   string `json:"format"`
					MimeType string `json:"mime_type"`
				} `json:"audio"`
			} `json:"message"`
		} `json:"choices"`
		Audio    string `json:"audio"`
		B64JSON  string `json:"b64_json"`
		Data     string `json:"data"`
		Format   string `json:"format"`
		MimeType string `json:"mime_type"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return SpeechResult{}, fmt.Errorf("upstream speech returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
	}
	audio := firstNonEmpty(parsed.Audio, parsed.B64JSON, parsed.Data)
	resultFormat := firstNonEmpty(parsed.Format, format)
	resultMime := firstNonEmpty(parsed.MimeType, mimeForAudio(resultFormat))
	if len(parsed.Choices) > 0 {
		audio = firstNonEmpty(parsed.Choices[0].Message.Audio.Data, audio)
		resultFormat = firstNonEmpty(parsed.Choices[0].Message.Audio.Format, resultFormat)
		resultMime = firstNonEmpty(parsed.Choices[0].Message.Audio.MimeType, resultMime)
	}
	if audio == "" {
		return SpeechResult{}, errors.New("upstream speech returned no audio data")
	}
	return SpeechResult{AudioBase64: stripDataURL(audio), Format: resultFormat, MimeType: resultMime}, nil
}

func useChatCompletionsSpeech(provider Provider, model Model) bool {
	value := strings.ToLower(strings.Join([]string{provider.ID, provider.Name, provider.BaseURL, model.UpstreamID}, " "))
	return strings.Contains(value, "xiaomi") || strings.Contains(value, "mimo-v2.5-tts")
}

func (c *ModelClient) SmokeTest(ctx context.Context, provider Provider, model Model) (int64, error) {
	timeout := time.Duration(model.TimeoutTotalSec) * time.Second
	if timeout <= 0 {
		timeout = 90 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	start := time.Now()
	var err error
	switch {
	case hasCapability(model, "image"):
		_, err = c.GenerateImage(ctx, provider, model, ImageRequest{
			Prompt:  "ChatWebUI smoke test",
			Size:    model.ImageSize,
			Quality: model.ImageQuality,
			Count:   1,
		})
	case hasCapability(model, "speech"):
		_, err = c.Speak(ctx, provider, model, SpeechRequest{
			Text:   "ChatWebUI smoke test",
			Voice:  model.Voice,
			Format: model.AudioFormat,
		})
	case hasCapability(model, "embedding"):
		err = c.CreateEmbedding(ctx, provider, model, "ChatWebUI smoke test")
	default:
		_, err = c.CompleteChat(ctx, provider, model, "Reply with OK.", []ThreadMessage{{
			Role:    "user",
			Content: []MessagePart{{Type: "text", Text: "Reply with OK."}},
		}})
	}
	latency := time.Since(start).Milliseconds()
	if latency < 1 {
		latency = 1
	}
	return latency, err
}

func (c *ModelClient) CreateEmbedding(ctx context.Context, provider Provider, model Model, input string) error {
	if provider.BaseURL == "" || provider.APIKey == "" {
		return errors.New("provider base_url or api_key is not configured")
	}
	payload := map[string]any{
		"model": model.UpstreamID,
		"input": input,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	url := strings.TrimRight(provider.BaseURL, "/") + "/embeddings"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	resBody, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("upstream embeddings failed: %s %s", res.Status, string(resBody))
	}
	var parsed struct {
		Data []json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return fmt.Errorf("upstream embeddings returned invalid json: %w; body=%s", err, upstreamBodyPreview(resBody))
	}
	if len(parsed.Data) == 0 {
		return errors.New("upstream embeddings returned no data")
	}
	return nil
}

func (s *Server) chooseModel(modelID string, capability string, user User) Model {
	if modelID != "" {
		if model, ok := s.store.Model(modelID); ok && model.Enabled && hasCapability(model, capability) && visibleTo(model.Visibility, user) {
			return model
		}
	}
	models := s.store.ListAvailableModels(capability, user)
	for _, model := range models {
		if model.DefaultRole == capability || capability == "speech" && model.DefaultRole == "tts" {
			return model
		}
	}
	if len(models) > 0 {
		return models[0]
	}
	return Model{}
}

func modelRequestTimeout(model Model, fallback time.Duration) time.Duration {
	if model.TimeoutTotalSec > 0 {
		return time.Duration(model.TimeoutTotalSec) * time.Second
	}
	return fallback
}

func (s *Server) recordGeneration(user User, model Model, provider Provider, requestID string, typ string, prompt string, response string, imageURLs []string, usage Usage, points int, durationMs int64, status string, errorType string, errorMessage string) Generation {
	providerName := provider.Name
	if providerName == "" {
		providerName = provider.ID
	}
	gen := Generation{ID: requestID, UserID: user.ID, UserName: user.Name, Type: typ, ModelID: model.ID, ModelName: model.UpstreamID, ProviderID: provider.ID, ProviderName: providerName, PromptMarkdown: prompt, ResponseMarkdown: response, ImageURLs: imageURLs, TokensIn: usage.TokensIn, TokensOut: usage.TokensOut, PointsCost: points, DurationMs: durationMs, Status: status, ErrorType: errorType, ErrorMessage: errorMessage, Trace: requestID, CreatedAt: time.Now().Format(time.RFC3339)}
	level := "info"
	if status != "ok" {
		level = "warn"
	}
	s.store.AddSystemLog(level, "generation", fmt.Sprintf("generation status=%s type=%s user=%s provider=%s model=%s duration_ms=%d points=%d error_type=%s error=%q", status, typ, user.ID, provider.ID, model.UpstreamID, durationMs, points, errorType, errorMessage))
	return s.store.AddGeneration(gen)
}

func estimateUsage(prompt string, text string) Usage {
	return Usage{TokensIn: estimateTokens(prompt), TokensOut: estimateTokens(text)}
}

func estimateTokens(text string) int {
	runes := len([]rune(text))
	if runes == 0 {
		return 0
	}
	return runes/2 + 1
}

func threadMessageText(message ThreadMessage) string {
	parts := []string{}
	for _, part := range message.Content {
		if part.Type == "text" && strings.TrimSpace(part.Text) != "" {
			parts = append(parts, part.Text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, "\n"))
}

func storedThreadMessages(messages []Message) []ThreadMessage {
	items := []ThreadMessage{}
	for _, message := range messages {
		if message.Role != "user" && message.Role != "assistant" && message.Role != "system" {
			continue
		}
		if strings.TrimSpace(message.ContentMarkdown) == "" {
			continue
		}
		items = append(items, ThreadMessage{
			Role:    message.Role,
			Content: []MessagePart{{Type: "text", Text: message.ContentMarkdown}},
		})
	}
	return items
}

func previousThreadMessages(messages []ThreadMessage, currentPrompt string) []ThreadMessage {
	currentPrompt = strings.TrimSpace(currentPrompt)
	currentIndex := -1
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role == "user" && strings.TrimSpace(threadMessageText(messages[i])) == currentPrompt {
			currentIndex = i
			break
		}
	}
	if currentIndex < 0 {
		currentIndex = len(messages)
	}
	items := []ThreadMessage{}
	for _, message := range messages[:currentIndex] {
		if message.Role != "user" && message.Role != "assistant" && message.Role != "system" {
			continue
		}
		if strings.TrimSpace(threadMessageText(message)) == "" {
			continue
		}
		items = append(items, message)
	}
	return items
}

func modelGroupFromID(id string) string {
	id = strings.TrimSpace(id)
	if id == "" {
		return "default"
	}
	for _, sep := range []string{"/", ":"} {
		if before, _, ok := strings.Cut(id, sep); ok && strings.TrimSpace(before) != "" {
			return strings.TrimSpace(before)
		}
	}
	if before, _, ok := strings.Cut(id, "-"); ok && strings.TrimSpace(before) != "" {
		return strings.TrimSpace(before)
	}
	return "default"
}

func capabilitiesFromModelID(id string) []string {
	value := strings.ToLower(id)
	switch {
	case strings.Contains(value, "embedding") || strings.Contains(value, "embed"):
		return []string{"embedding"}
	case strings.Contains(value, "image") || strings.Contains(value, "dall-e") || strings.Contains(value, "flux"):
		return []string{"image"}
	case strings.Contains(value, "tts") || strings.Contains(value, "speech") || strings.Contains(value, "audio"):
		return []string{"speech"}
	default:
		return []string{"chat"}
	}
}

func contextWindowFromModelID(id string) int {
	value := strings.ToLower(id)
	switch {
	case strings.Contains(value, "128k") || strings.Contains(value, "gpt-4.1") || strings.Contains(value, "gpt-5"):
		return 128000
	case strings.Contains(value, "32k"):
		return 32000
	case strings.Contains(value, "16k"):
		return 16000
	default:
		return 0
	}
}

func mimeForAudio(format string) string {
	switch strings.ToLower(format) {
	case "wav":
		return "audio/wav"
	case "ogg":
		return "audio/ogg"
	case "opus":
		return "audio/ogg"
	default:
		return "audio/mpeg"
	}
}

func stripDataURL(value string) string {
	if idx := strings.Index(value, ","); strings.HasPrefix(value, "data:") && idx >= 0 {
		return value[idx+1:]
	}
	return value
}

func classifyError(err error) string {
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "401") || strings.Contains(message, "unauthorized") || strings.Contains(message, "api key"):
		return "auth"
	case strings.Contains(message, "403") || strings.Contains(message, "permission"):
		return "permission"
	case strings.Contains(message, "404") || strings.Contains(message, "not found"):
		return "not_found"
	case strings.Contains(message, "429") || strings.Contains(message, "rate"):
		return "rate_limit"
	case strings.Contains(message, "timeout") || strings.Contains(message, "deadline"):
		return "timeout"
	case strings.Contains(message, "json") || strings.Contains(message, "format"):
		return "format"
	default:
		return "upstream"
	}
}
