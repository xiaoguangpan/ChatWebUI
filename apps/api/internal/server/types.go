package server

type User struct {
	ID         string `json:"id"`
	Phone      string `json:"phone"`
	Name       string `json:"name"`
	Role       string `json:"role"`
	Plan       string `json:"plan"`
	Status     string `json:"status"`
	Points     int    `json:"points"`
	Chats      int    `json:"chats"`
	Images     int    `json:"images"`
	AvatarURL  string `json:"avatar_url"`
	CreatedAt  string `json:"created_at"`
	LastActive string `json:"last_active"`
}

type AuthRequest struct {
	Phone           string `json:"phone"`
	Password        string `json:"password"`
	PasswordConfirm string `json:"password_confirm"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type Provider struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Short     string `json:"short"`
	Type      string `json:"type"`
	TypeLabel string `json:"type_label"`
	BaseURL   string `json:"base_url"`
	KeyMasked string `json:"key_masked"`
	APIKey    string `json:"-"`
	Enabled   bool   `json:"enabled"`
	Remark    string `json:"remark,omitempty"`
}

type Model struct {
	ID                  string   `json:"id"`
	ProviderID          string   `json:"provider_id"`
	ProviderName        string   `json:"provider_name,omitempty"`
	Group               string   `json:"group"`
	UpstreamID          string   `json:"upstream_id"`
	DisplayName         string   `json:"display_name"`
	Description         string   `json:"description"`
	Capabilities        []string `json:"capabilities"`
	Enabled             bool     `json:"enabled"`
	Visibility          string   `json:"visibility"`
	DefaultRole         string   `json:"default_role,omitempty"`
	SortWeight          int      `json:"sort_weight"`
	SSE                 bool     `json:"sse"`
	ContextWindow       int      `json:"context_window,omitempty"`
	PointsPolicyID      string   `json:"points_policy_id"`
	PointsPolicySummary string   `json:"points_policy_summary"`
	RPM                 int      `json:"rpm,omitempty"`
	TPM                 int      `json:"tpm,omitempty"`
	MaxConcurrency      int      `json:"max_concurrency,omitempty"`
	TimeoutTotalSec     int      `json:"timeout_total_sec,omitempty"`
	ImageSize           string   `json:"image_size,omitempty"`
	ImageQuality        string   `json:"image_quality,omitempty"`
	Voice               string   `json:"voice,omitempty"`
	AudioFormat         string   `json:"audio_format,omitempty"`
	ReasoningEffort     string   `json:"reasoning_effort,omitempty"`
	SmokeStatus         string   `json:"smoke_status"`
	SmokeLatencyMs      int      `json:"smoke_latency_ms,omitempty"`
	SmokeError          string   `json:"smoke_error,omitempty"`
	SmokeErrorType      string   `json:"smoke_error_type,omitempty"`
	SmokeErrorDetail    string   `json:"smoke_error_detail,omitempty"`
	HealthStatus        string   `json:"health_status"`
	HealthText          string   `json:"health_text"`
	Calls7d             string   `json:"calls_7d"`
}

type PointsPolicy struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Mode        string `json:"mode"`
	Summary     string `json:"summary"`
	InputPer1K  int    `json:"input_per_1k,omitempty"`
	OutputPer1K int    `json:"output_per_1k,omitempty"`
	PerChat     int    `json:"per_chat,omitempty"`
	PerImage    int    `json:"per_image,omitempty"`
	PerSpeech   int    `json:"per_speech,omitempty"`
	PerOther    int    `json:"per_other,omitempty"`
	Enabled     bool   `json:"enabled"`
}

type Conversation struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type Message struct {
	ID              string `json:"id"`
	ConversationID  string `json:"conversation_id"`
	Role            string `json:"role"`
	ContentMarkdown string `json:"content_markdown"`
	ModelID         string `json:"model_id,omitempty"`
	ProviderID      string `json:"provider_id,omitempty"`
	TokensIn        int    `json:"tokens_in,omitempty"`
	TokensOut       int    `json:"tokens_out,omitempty"`
	PointsCost      int    `json:"points_cost,omitempty"`
	CreatedAt       string `json:"created_at"`
}

type Usage struct {
	TokensIn   int `json:"tokens_in"`
	TokensOut  int `json:"tokens_out"`
	PointsCost int `json:"points_cost"`
}

type Generation struct {
	ID               string   `json:"id"`
	UserID           string   `json:"user_id"`
	UserName         string   `json:"user_name"`
	Type             string   `json:"type"`
	ModelID          string   `json:"model_id"`
	ModelName        string   `json:"model_name"`
	ProviderID       string   `json:"provider_id"`
	ProviderName     string   `json:"provider_name"`
	PromptMarkdown   string   `json:"prompt_markdown"`
	ResponseMarkdown string   `json:"response_markdown,omitempty"`
	ImageURLs        []string `json:"image_urls,omitempty"`
	AudioBase64      string   `json:"audio_base64,omitempty"`
	AudioFormat      string   `json:"audio_format,omitempty"`
	TokensIn         int      `json:"tokens_in,omitempty"`
	TokensOut        int      `json:"tokens_out,omitempty"`
	PointsCost       int      `json:"points_cost"`
	DurationMs       int64    `json:"duration_ms"`
	Status           string   `json:"status"`
	ErrorType        string   `json:"error_type,omitempty"`
	ErrorMessage     string   `json:"error_message,omitempty"`
	Trace            string   `json:"trace,omitempty"`
	CreatedAt        string   `json:"created_at"`
}

type PointsLog struct {
	ID            string `json:"id"`
	UserID        string `json:"user_id"`
	UserName      string `json:"user_name"`
	Type          string `json:"type"`
	Amount        int    `json:"amount"`
	BalanceBefore int    `json:"balance_before"`
	BalanceAfter  int    `json:"balance_after"`
	SourceType    string `json:"source_type"`
	SourceID      string `json:"source_id"`
	Remark        string `json:"remark"`
	CreatedAt     string `json:"created_at"`
}

type SystemLog struct {
	ID        string `json:"id"`
	Level     string `json:"level"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

type LoginHistory struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Account   string `json:"account"`
	IP        string `json:"ip"`
	UserAgent string `json:"user_agent"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
}

type ImageRequest struct {
	Prompt  string `json:"prompt"`
	ModelID string `json:"model_id"`
	Size    string `json:"size"`
	Quality string `json:"quality"`
	Count   int    `json:"count"`
}

type ImageResponse struct {
	ID         string   `json:"id"`
	ModelID    string   `json:"model_id"`
	ImageURLs  []string `json:"image_urls"`
	PointsCost int      `json:"points_cost"`
	Status     string   `json:"status"`
}

type SpeechRequest struct {
	Text    string `json:"text"`
	ModelID string `json:"model_id"`
	Voice   string `json:"voice"`
	Format  string `json:"format"`
}

type SpeechResponse struct {
	ID          string `json:"id"`
	ModelID     string `json:"model_id"`
	Voice       string `json:"voice"`
	Format      string `json:"format"`
	MimeType    string `json:"mime_type"`
	AudioBase64 string `json:"audio_base64"`
	DataURL     string `json:"data_url"`
	PointsCost  int    `json:"points_cost"`
}

type AdjustPointsRequest struct {
	Amount int    `json:"amount"`
	Remark string `json:"remark"`
}

type ChangePlanRequest struct {
	Plan string `json:"plan"`
}

type UpdateProfileRequest struct {
	Name string `json:"name"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	PasswordConfirm string `json:"password_confirm"`
}

type ResetPasswordRequest struct {
	NewPassword     string `json:"new_password"`
	PasswordConfirm string `json:"password_confirm"`
}

type CreateUserRequest struct {
	Phone    string `json:"phone"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     string `json:"role"`
	Plan     string `json:"plan"`
	Status   string `json:"status"`
	Points   int    `json:"points"`
}

type CreateProviderRequest struct {
	Name    string               `json:"name"`
	Short   string               `json:"short"`
	Type    string               `json:"type"`
	BaseURL string               `json:"base_url"`
	APIKey  string               `json:"api_key"`
	Enabled *bool                `json:"enabled,omitempty"`
	Remark  string               `json:"remark"`
	Models  []CreateModelRequest `json:"models,omitempty"`
}

type PatchProviderRequest struct {
	Name    *string `json:"name,omitempty"`
	Short   *string `json:"short,omitempty"`
	Type    *string `json:"type,omitempty"`
	BaseURL *string `json:"base_url,omitempty"`
	Enabled *bool   `json:"enabled,omitempty"`
	Remark  *string `json:"remark,omitempty"`
}

type CreateModelRequest struct {
	ProviderID    string   `json:"provider_id"`
	UpstreamID    string   `json:"upstream_id"`
	DisplayName   string   `json:"display_name"`
	Group         string   `json:"group"`
	Capabilities  []string `json:"capabilities"`
	ContextWindow int      `json:"context_window,omitempty"`
}

type DiscoveredModel struct {
	ID            string   `json:"id"`
	DisplayName   string   `json:"display_name,omitempty"`
	Group         string   `json:"group"`
	Capabilities  []string `json:"capabilities"`
	ContextWindow int      `json:"context_window,omitempty"`
}

type PatchModelRequest struct {
	DisplayName    *string `json:"display_name,omitempty"`
	Enabled        *bool   `json:"enabled,omitempty"`
	Visibility     *string `json:"visibility,omitempty"`
	DefaultRole    *string `json:"default_role,omitempty"`
	SortWeight     *int    `json:"sort_weight,omitempty"`
	SSE            *bool   `json:"sse,omitempty"`
	PointsPolicyID *string `json:"points_policy_id,omitempty"`
	ImageSize      *string `json:"image_size,omitempty"`
	ImageQuality   *string `json:"image_quality,omitempty"`
	Voice          *string `json:"voice,omitempty"`
	AudioFormat    *string `json:"audio_format,omitempty"`
}

type PatchPolicyRequest struct {
	Name        *string `json:"name,omitempty"`
	Mode        *string `json:"mode,omitempty"`
	Summary     *string `json:"summary,omitempty"`
	InputPer1K  *int    `json:"input_per_1k,omitempty"`
	OutputPer1K *int    `json:"output_per_1k,omitempty"`
	PerChat     *int    `json:"per_chat,omitempty"`
	PerImage    *int    `json:"per_image,omitempty"`
	PerSpeech   *int    `json:"per_speech,omitempty"`
	PerOther    *int    `json:"per_other,omitempty"`
	Enabled     *bool   `json:"enabled,omitempty"`
}
