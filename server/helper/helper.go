package helper

import (
	"strings"
	"time"

	"github.com/andrewstuart/go-robinhood"
)

// PrettyTime converts a time to pretty date format
func PrettyTime(t int64) string {
	return time.Unix(t, 0).Format("01/02/06")
}

// PrettyTime converts a time minute specific
func PrettyTime2(t int64) string {
	return time.Unix(t, 0).Format("01/02/06 - 03:04")
}

func IsInList(a string, list []string) bool {
	result := false
	for _, s := range list {
		if a == s {
			result = true
		}
	}

	return result
}

func PrettyBoughtMessage(t bool) string {
	if t {
		return "bought"
	}
	return " sold "
}

func PrettyBuy(t bool) string {
	if t {
		return "Buy"
	}
	return "Sell"
}

func PrettyBoughtMessageFromSide(t robinhood.OrderSide) string {
	if t == robinhood.Buy {
		return "bought"
	}
	return "sold  "
}

func LeftPad2Len(s string, padStr string, overallLen int) string {
	var padCountInt = 1 + ((overallLen - len(padStr)) / len(padStr))
	var retStr = strings.Repeat(padStr, padCountInt) + s
	return retStr[(len(retStr) - overallLen):]
}
