package main

import (
	"log"

	"chatwebui/apps/api/internal/server"
)

func main() {
	cfg := server.LoadConfig()
	if err := cfg.ValidateForServe(); err != nil {
		log.Fatal(err)
	}
	srv := server.New(cfg)

	log.Printf("ChatWebUI API listening on http://%s", cfg.Addr())
	log.Fatal(srv.ListenAndServe())
}
