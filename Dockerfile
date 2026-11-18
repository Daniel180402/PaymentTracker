# syntax=docker/dockerfile:1

# 1) Web app: Vite build, then precompressed with brotli and gzip.
#    Runs on the build machine's own architecture, the output is plain files.
FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY public public
COPY src src
COPY scripts/compress.mjs scripts/
RUN npm run build && node scripts/compress.mjs dist

# 2) Server: one static Go binary with the web app embedded.
#    Cross-compiled, so building for a Raspberry Pi or a NAS needs no emulation.
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS server
ARG TARGETOS TARGETARCH
WORKDIR /src
COPY server/go.mod ./
COPY server/*.go ./
COPY --from=web /app/dist ./dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/paymenttracker . \
 && mkdir -p /out/data

# 3) Runtime: nothing but the binary. No shell, no package manager, not root.
FROM scratch
COPY --from=server /out/paymenttracker /paymenttracker
COPY --from=server --chown=65534:65534 /out/data /data
USER 65534:65534
ENV PT_ADDR=:8080 PT_DATA_DIR=/data
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/paymenttracker", "-healthcheck"]
ENTRYPOINT ["/paymenttracker"]
