package server

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
)

func encryptionKey(secret string) []byte {
	sum := sha256.Sum256([]byte(secret))
	return sum[:]
}

func encryptString(secret string, plain string) (ciphertext string, nonceText string, err error) {
	if plain == "" {
		return "", "", nil
	}
	block, err := aes.NewCipher(encryptionKey(secret))
	if err != nil {
		return "", "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", err
	}
	out := gcm.Seal(nil, nonce, []byte(plain), nil)
	return base64.StdEncoding.EncodeToString(out), base64.StdEncoding.EncodeToString(nonce), nil
}

func decryptString(secret string, ciphertext string, nonceText string) string {
	if ciphertext == "" || nonceText == "" {
		return ""
	}
	block, err := aes.NewCipher(encryptionKey(secret))
	if err != nil {
		return ""
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return ""
	}
	nonce, err := base64.StdEncoding.DecodeString(nonceText)
	if err != nil {
		return ""
	}
	data, err := base64.StdEncoding.DecodeString(ciphertext)
	if err != nil {
		return ""
	}
	plain, err := gcm.Open(nil, nonce, data, nil)
	if err != nil {
		return ""
	}
	return string(plain)
}
