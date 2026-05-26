package server

type Store interface {
	Register(phone string, password string) (AuthResponse, error)
	Login(phone string, password string) (AuthResponse, error)
	UserByToken(token string) (User, bool)
	DeleteSession(token string)
	ListUsers() []User
	AddUser(req CreateUserRequest) (User, error)
	User(id string) (User, bool)
	ChangePassword(userID string, currentPassword string, newPassword string) error
	ResetPassword(userID string, newPassword string) error
	UpdateProfile(userID string, req UpdateProfileRequest) (User, error)
	UpdateAvatar(userID string, avatarURL string) (User, error)
	ChangeUserPlan(id string, plan string) (User, error)
	SetUserStatus(id string, status string) (User, error)
	ListProviders() []Provider
	AddProvider(provider Provider) Provider
	PatchProvider(id string, patch PatchProviderRequest) (Provider, error)
	ListModels() []Model
	AddModel(model Model) Model
	ListAvailableModels(kind string, user User) []Model
	Model(id string) (Model, bool)
	DeleteModel(id string) error
	Provider(id string) (Provider, bool)
	ListPolicies() []PointsPolicy
	AddPolicy(policy PointsPolicy) (PointsPolicy, error)
	PatchPolicy(id string, patch PatchPolicyRequest) (PointsPolicy, error)
	PatchModel(id string, patch PatchModelRequest) (Model, error)
	SetDefaultModel(id string, role string) (Model, error)
	AddConversation(userID string, title string) Conversation
	ListConversations(userID string) []Conversation
	DeleteConversation(conversationID string) error
	AddMessage(message Message) Message
	Messages(conversationID string) []Message
	DeleteMessagePair(conversationID string, messageID string) error
	AddGeneration(gen Generation) Generation
	ListGenerations() []Generation
	ListUserGenerations(userID string) []Generation
	DeleteUserGeneration(userID string, generationID string) error
	UpdateGenerationAudio(id string, audioBase64 string, format string)
	AddPointsLog(userID string, typ string, amount int, sourceType string, sourceID string, remark string) PointsLog
	ListPointsLogs() []PointsLog
	ListUserPointsLogs(userID string) []PointsLog
	AddSystemLog(level string, typ string, message string) SystemLog
	ListSystemLogs() []SystemLog
	AddLoginHistory(userID string, account string, ip string, userAgent string, status string, message string) LoginHistory
	ListLoginHistory(userID string) []LoginHistory
	Charge(userID string, amount int, sourceType string, sourceID string, remark string) error
	MarkModelSuccess(modelID string, latency int64)
	MarkModelFailure(modelID string, errorType string, message string)
	Dashboard() map[string]any
	PointsForModel(model Model, units int) int
}
