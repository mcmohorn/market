package helper

import "time"

// PrettyTime converts a time to pretty date format
func PrettyTime(t int64) string {
	return time.Unix(t, 0).Format("01/02/06")
}
