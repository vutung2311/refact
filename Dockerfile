# syntax = devthefuture/dockerfile-x

FROM ./Dockerfile.base

ENV PATH="/opt/venv/bin:/usr/local/linguist/bin:${PATH}"

# cassandra
# refact lsp requisites
RUN export DEBIAN_FRONTEND="noninteractive" TZ=Etc/UTC \
    && apt-get update \
    && apt-get install -y \
        curl \
        build-essential \
        git \
        htop \
        libssl-dev \
        python3 \
        python3-pip \
        python3-venv \
        ruby-full \
        ruby-bundler \
        tmux \
        file \
        vim \
        expect \
        mpich \
        libmpich-dev \
        pkg-config \
        default-jdk \
        wget \
        protobuf-compiler \
        sudo \
    \
    && echo "deb https://debian.cassandra.apache.org 41x main" | tee -a /etc/apt/sources.list.d/cassandra.sources.list \
    && curl https://downloads.apache.org/cassandra/KEYS | apt-key add - \
    && apt-get update \
    && apt-get install cassandra -y \
    && rm -rf /var/lib/{apt,dpkg,cache,log}

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | bash -s -- -y \
    && export PATH="${PATH}:/root/.cargo/bin" \
    && git clone https://github.com/smallcloudai/refact-lsp.git /tmp/refact-lsp \
    && echo "refact-lsp $(git -C /tmp/refact-lsp rev-parse HEAD)" >> /refact-build-info.txt \
    && cd /tmp/refact-lsp \
    && cargo install --path . --root /usr/local \
    && rm -rf /tmp/refact-lsp

ARG MAX_JOBS=8
ARG USE_NINJA=1
ARG NINJAFLAGS="-j${MAX_JOBS}}"
ARG TORCH_CUDA_ARCH_LIST="8.0 9.0+PTX"
ARG NVCC_THREADS=${MAX_JOBS}
ARG USE_FLASH_ATTENTION=1
ARG USE_MEM_EFF_ATTENTION=1

WORKDIR /app

COPY . /app
RUN echo "refact $(git -C /app rev-parse HEAD)" >> /refact-build-info.txt \
    && pip install wheel setuptools \
    && pip install -e . -v --no-build-isolation

ENV REFACT_PERM_DIR "/perm_storage"
ENV REFACT_TMP_DIR "/tmp"
ENV RDMAV_FORK_SAFE 0
ENV RDMAV_HUGEPAGES_SAFE 0

EXPOSE 8008

COPY database-start.sh /
RUN chmod +x database-start.sh
COPY docker-entrypoint.sh /
RUN chmod +x docker-entrypoint.sh

CMD ./docker-entrypoint.sh
