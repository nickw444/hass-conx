FROM docker.io/library/debian:bookworm-slim@sha256:88200866dfff7ea7f5cbcb6ec7c8a701889efe6fe859fe64d6990e4b07ea4171

ARG BUILD_VERSION=0.1.4
ARG BUILD_ARCH=unknown

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
      bubblewrap=0.8.0-2+deb12u1 \
      ca-certificates=20250419~deb12u1 \
      python3=3.11.2-1+b1 \
      util-linux=2.38.1-5+deb12u3 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 --shell /usr/sbin/nologin backend \
    && mkdir -p /home/provider \
    && chown 0:0 /home/provider \
    && chmod 0700 /home/provider

COPY backend_server.py provider_probe.py entrypoint.sh /opt/hass-conx-protected-ha-probe/
RUN chmod 0755 /opt/hass-conx-protected-ha-probe/entrypoint.sh \
    /opt/hass-conx-protected-ha-probe/backend_server.py \
    /opt/hass-conx-protected-ha-probe/provider_probe.py \
    && mkdir -p /data/spike-008 \
    && chmod 0777 /data/spike-008

WORKDIR /opt/hass-conx-protected-ha-probe
EXPOSE 8099
CMD ["/opt/hass-conx-protected-ha-probe/entrypoint.sh"]
