FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY backend/ /app/backend/
COPY deploy/cloudbase-entrypoint.sh /usr/local/bin/cloudbase-entrypoint

RUN chmod +x /usr/local/bin/cloudbase-entrypoint \
    && mkdir -p /app/backend/storage/inspection_photos /app/backend/storage/asset_photos

ENV PORT=80 \
    CORS_ALLOW_ORIGINS=*

EXPOSE 80

ENTRYPOINT ["cloudbase-entrypoint"]
