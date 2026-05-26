FROM golang:1.25-alpine AS build

WORKDIR /src
COPY go.work ./
COPY apps/api/go.mod apps/api/go.sum ./apps/api/
WORKDIR /src/apps/api
RUN go mod download

WORKDIR /src
COPY apps/api ./apps/api
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/chatwebui-api ./apps/api/cmd/server

FROM alpine:3.22

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata \
  && adduser -D -H -u 10001 appuser \
  && mkdir -p /app/uploads /app/apps/api/migrations \
  && chown -R appuser:appuser /app

COPY --from=build /out/chatwebui-api /app/chatwebui-api
COPY apps/api/migrations /app/apps/api/migrations

ENV HOST=0.0.0.0 \
  PORT=8787 \
  UPLOAD_DIR=/app/uploads

USER appuser
EXPOSE 8787
CMD ["/app/chatwebui-api"]
