#!/bin/bash -xe

docker run -v $PWD:/overleaf-src \
    -it --rm \
    --network host \
    -v /var/run/docker.sock:/var/run/docker.sock \
    docker:20.10 \
    /bin/ash -c "apk add git make && git config --global --add safe.directory /overleaf-src && cd /overleaf-src/server-ce && make all"
    
docker image tag sharelatex/sharelatex:track-changes ivanristovic/sharelatex:full-enh
docker push ivanristovic/sharelatex:full-enh 
