package reader

import (
	"bufio"
	"log"
	"os"
	
)


func ReadTickersFromFile(filename string) []string {
	result := make([]string, 0)
	file, err := os.Open(filename)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		result = append(result, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
	return result
}






