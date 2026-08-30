FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends bubblewrap ca-certificates curl util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 app \
    && useradd --create-home --uid 1001 agent

COPY probe.sh /usr/local/bin/probe.sh
RUN chmod 0755 /usr/local/bin/probe.sh

WORKDIR /config
CMD ["/bin/sh"]
