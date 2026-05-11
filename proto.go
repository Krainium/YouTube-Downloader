package main

import (
	"bytes"
	"encoding/base64"
	"math/rand"
	"net/url"
	"time"
)

// ─── ProtoBuilder ─────────────────────────────────────────────────────────────
// Minimal protobuf wire encoder (length-delimited, varint, bytes fields).

type ProtoBuilder struct {
	buf bytes.Buffer
}

func (pb *ProtoBuilder) ToBytes() []byte { return pb.buf.Bytes() }

func (pb *ProtoBuilder) ToURLEncodedBase64() string {
	b64 := base64.URLEncoding.EncodeToString(pb.ToBytes())
	return url.QueryEscape(b64)
}

func (pb *ProtoBuilder) writeVarint(val int64) {
	if val == 0 {
		pb.buf.WriteByte(0)
		return
	}
	for val > 0 {
		b := byte(val & 0x7F)
		val >>= 7
		if val != 0 {
			b |= 0x80
		}
		pb.buf.WriteByte(b)
	}
}

func (pb *ProtoBuilder) field(fieldNum int, wireType byte) {
	pb.writeVarint(int64(fieldNum<<3) | int64(wireType&0x07))
}

func (pb *ProtoBuilder) Varint(fieldNum int, val int64) {
	pb.field(fieldNum, 0)
	pb.writeVarint(val)
}

func (pb *ProtoBuilder) String(fieldNum int, s string) {
	pb.Bytes(fieldNum, []byte(s))
}

func (pb *ProtoBuilder) Bytes(fieldNum int, data []byte) {
	pb.field(fieldNum, 2)
	pb.writeVarint(int64(len(data)))
	pb.buf.Write(data)
}

// ─── Random visitor data ──────────────────────────────────────────────────────
// Generates a random protobuf-encoded visitor data string used as the
// x-goog-visitor-id header value. A fresh value is generated per request.

const cpnAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

func randStr(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = cpnAlphabet[rand.Intn(len(cpnAlphabet))]
	}
	return string(b)
}

func randomVisitorData(countryCode string) string {
	var pbE2 ProtoBuilder
	pbE2.String(2, "")
	pbE2.Varint(4, int64(rand.Intn(255)+1))

	var pbE ProtoBuilder
	pbE.String(1, countryCode)
	pbE.Bytes(2, pbE2.ToBytes())

	var pb ProtoBuilder
	pb.String(1, randStr(11))
	pb.Varint(5, time.Now().Unix()-int64(rand.Intn(600000)))
	pb.Bytes(6, pbE.ToBytes())

	return pb.ToURLEncodedBase64()
}
