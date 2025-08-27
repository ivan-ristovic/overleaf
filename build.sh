#!/bin/bash -xe

tag="${1:-latest}"

cd ./server-ce/
make all

## Containerized docker-in-docker build (for earlier versions of sharelatex)
# docker run -v "$PWD":/overleaf-src \
#     -it --rm \
#     --network host \
#     -v /var/run/docker.sock:/var/run/docker.sock \
#     docker:20.10 \
#     /bin/ash -c "apk add git make && git config --global --add safe.directory /overleaf-src && cd /overleaf-src/server-ce && make all"
 
docker image tag sharelatex/sharelatex:ext-ce "ivanristovic/sharelatex:$tag"
docker push "ivanristovic/sharelatex:$tag"

