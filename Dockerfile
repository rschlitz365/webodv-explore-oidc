FROM ubuntu:20.04
#FROM ubuntu:22.04

# install curl, apache2 sudo, npm and xvfb
RUN apt-get update && apt-get -y upgrade && DEBIAN_FRONTEND=noninteractive \
    apt-get -y install \
    curl \
    apache2 \
    sudo \
    npm \
    xvfb \
    iproute2 \
    net-tools \
    nano

#RUN apt-get -y remove nodejs
#RUN apt-get -y remove libnode72

# install node
RUN curl -sL https://deb.nodesource.com/setup_20.x -o nodesource_file.sh
RUN chmod +x nodesource_file.sh
RUN ./nodesource_file.sh
RUN apt-get -y install nodejs

# apache2 configuration
RUN a2enmod rewrite && a2enmod proxy && a2enmod proxy_http && a2enmod proxy_wstunnel
COPY apache_settings.conf /etc/apache2/sites-available/000-default.conf

# create new user webodvx
RUN useradd -u 1000 -ms /bin/bash webodvx

# set work dir
WORKDIR /home/webodvx

# switch from root to user webodvx
#USER webodvx

# copy the odvapp and server directories into the image
COPY odvapp ./odvapp
COPY server ./server
COPY run_odvws ./run_odvws
COPY start_webodvx_server ./start_webodvx_server

# this is the port which is used by node, e.g. app.js
EXPOSE 3000

# start the server
#CMD ["sleep", "infinity"]
CMD ./start_webodvx_server
