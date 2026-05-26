package server

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
)

var nicknamePrefixes = []string{
	"青岚", "云舒", "听雪", "墨澜", "竹隐", "星河", "清弦", "疏影", "南柯", "扶摇",
	"月白", "长风", "知微", "若水", "玄青", "归云", "临渊", "照夜", "惊鸿", "初晴",
}

var nicknameSuffixes = []string{
	"行者", "书生", "词客", "听雨", "观星", "拾光", "渡舟", "问月", "寻鹤", "煮茶",
	"临风", "入梦", "折桂", "望舒", "青衿", "归客", "栖云", "怀瑾", "知秋", "揽月",
}

func randomGuofengNickname() string {
	return nicknamePrefixes[randomIndex(len(nicknamePrefixes))] + nicknameSuffixes[randomIndex(len(nicknameSuffixes))]
}

func uniqueNicknameFallback(base string) string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s%08x", base, randomIndex(0x7fffffff))
	}
	return fmt.Sprintf("%s-%s", base, strings.ToUpper(hex.EncodeToString(buf)))
}

func randomIndex(n int) int {
	if n <= 1 {
		return 0
	}
	value, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(value.Int64())
}
