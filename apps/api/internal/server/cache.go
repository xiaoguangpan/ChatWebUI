package server

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

func NewRedisClient(config Config) *redis.Client {
	client := redis.NewClient(&redis.Options{Addr: config.RedisAddr})
	return client
}

func redisHealth(client *redis.Client) string {
	if client == nil {
		return "disabled"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return "unavailable"
	}
	return "ok"
}
