package server

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

func newID(prefix string) string {
	return prefix + "_" + strings.ReplaceAll(uuid.NewString(), "-", "")
}

func randomToken() string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("token_%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func maskKey(key string) string {
	key = strings.TrimSpace(key)
	if key == "" {
		return "未配置"
	}
	if len(key) <= 8 {
		return key[:1] + "***"
	}
	return key[:4] + "***" + key[len(key)-4:]
}

func providerTypeLabel(providerType string) string {
	switch providerType {
	case "openai_compatible":
		return "OpenAI 兼容"
	case "anthropic":
		return "Anthropic"
	case "google":
		return "Google"
	case "ollama":
		return "Ollama / 本地"
	case "replicate":
		return "Replicate"
	case "midjourney_proxy":
		return "MidJourney Proxy"
	case "comfyui":
		return "ComfyUI"
	default:
		if providerType == "" {
			return "OpenAI 兼容"
		}
		return providerType
	}
}

func defaultPolicyForCapabilities(capabilities []string) string {
	return "default_call"
}

func hasCapability(model Model, capability string) bool {
	if capability == "" || capability == "all" {
		return true
	}
	if capability == "tts" {
		capability = "speech"
	}
	for _, item := range model.Capabilities {
		if item == capability {
			return true
		}
	}
	return false
}

func visibleTo(visibility string, user User) bool {
	switch visibility {
	case "draft", "admin":
		return user.Role == "admin"
	case "plus":
		return user.Role == "admin" || user.Plan == "plus"
	default:
		return true
	}
}

func sortModels(items []Model) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].DefaultRole != items[j].DefaultRole {
			return items[i].DefaultRole != ""
		}
		if items[i].SortWeight != items[j].SortWeight {
			return items[i].SortWeight > items[j].SortWeight
		}
		return items[i].UpstreamID < items[j].UpstreamID
	})
}

func defaultRoleForModel(model Model) string {
	if hasCapability(model, "chat") {
		return "chat"
	}
	if hasCapability(model, "image") {
		return "image"
	}
	if hasCapability(model, "embedding") {
		return "embedding"
	}
	if hasCapability(model, "speech") {
		return "tts"
	}
	return ""
}

func incrementCompact(value string) string {
	if value == "" || value == "0" {
		return "1"
	}
	if strings.HasSuffix(value, "k") {
		return value
	}
	var current int
	if _, err := fmt.Sscanf(value, "%d", &current); err != nil {
		return value
	}
	return fmt.Sprintf("%d", current+1)
}

func truncateTitle(text string) string {
	text = strings.TrimSpace(strings.ReplaceAll(text, "\n", " "))
	runes := []rune(text)
	if len(runes) <= 28 {
		return text
	}
	return string(runes[:28]) + "..."
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func envOr(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func tail(value string, n int) string {
	runes := []rune(value)
	if len(runes) <= n {
		return value
	}
	return string(runes[len(runes)-n:])
}

func timeString(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}
