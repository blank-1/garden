FROM node:12.16.1-buster

# system dependencies
RUN set -ex; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
  apt-transport-https \
  bash \
  ca-certificates \
  curl \
  gnupg2 \
  git \
  gzip \
  openssl \
  rsync \
  software-properties-common; \
  \
  curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -; \
  add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"; \
  apt-get update; \
  apt-get install docker-ce-cli; \
  rm -rf /var/lib/apt/lists/*;

ADD . /garden

WORKDIR /project

RUN ln -s /garden/garden /bin/garden \
  && chmod +x /bin/garden \
  && cd /garden/static \
  && git init \
  && garden util fetch-tools --all --logger-type=basic

ENTRYPOINT ["/garden/garden"]
