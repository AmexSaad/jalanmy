FROM python:3.12-slim
WORKDIR /app
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ ./server/
RUN mkdir -p /data && useradd --uid 10001 --create-home jalanmy && chown -R jalanmy:jalanmy /data /app
USER jalanmy
EXPOSE 8080
CMD ["python", "-m", "server.bootstrap"]
