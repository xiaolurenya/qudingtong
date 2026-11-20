FROM node:24-alpine
WORKDIR /app
ENV PORT=8282 TZ=Asia/Shanghai NODE_ENV=production \
    DATA_DIR=/app/data \
    QDT_DB_DIR=/app/data \
    QDT_SECURITY_DB_DIR=/app/data/security \
    QDT_BACKUP_DIR=/app/backups \
    WEB_CONCURRENCY=4
COPY package.json VERSION ./
COPY server.mjs cluster.mjs entrypoint.sh ./
COPY lib ./lib
COPY public ./public
COPY qdt-print-agent-win ./qdt-print-agent-win
COPY qdt-print-agent-win7-ps2 ./qdt-print-agent-win7-ps2
RUN chmod 755 /app /app/server.mjs /app/cluster.mjs /app/entrypoint.sh /app/lib /app/public && \
    chmod 644 /app/package.json /app/VERSION /app/lib/*.mjs /app/public/* && \
    chmod -R a+rX /app/qdt-print-agent-win /app/qdt-print-agent-win7-ps2 && \
    mkdir -p /app/data /app/data/security /app/backups && \
    chown -R 1000:1000 /app /app/data /app/backups
USER 1000:1000
EXPOSE 8282
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/entrypoint.sh"]