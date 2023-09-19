# Iron Fish Tank

The Iron Fish Tank is a framework to simulate and test the [Iron Fish]
ecosystem. With it, you can run arbitrarily large Iron Fish networks in an
isolated environment, without affecting the Iron Fish MainNet or TestNet.

The Iron Fish Tank comes with a TypeScript SDK (meant to be used to write
integration and acceptance tests) and a command line tool (meant to be used for
manual experimentation and testing).

**The Iron Fish Tank is currently under active development and is not intented
for general use yet!**

[Iron Fish]: https://ironfish.network

## Quick start

1.  **Install Docker:** The Iron Fish Tank needs [Docker] to run, so first of
    all you'll need to download and install Docker for your platform.

1.  **(Optional) Set necessary permissions to use Docker:** On some platforms
    (most notably Linux), access to Docker is restricted by default and only
    the root user may interact with Docker. If you don't want to run the Iron
    Fish Tank as root, you may want to allow your user to access the Docker
    socket:

    ```sh
    setfacl -m u:$USER:rw /var/run/docker.sock
    ```

1.  **(Optional) Pull the Iron Fish Docker image:** By default, the Iron Fish
    Tank expects to use a Docker image named `ironfish:latest`, however this
    image is not available in fresh installations of Docker, and needs to be
    either manually downloaded, or manually built. To download it from the
    official Iron Fish Docker Registry, and give it the name `ironfish:latest`,
    run the following:

    ```sh
    docker pull ghcr.io/iron-fish/ironfish:latest
    docker tag ghcr.io/iron-fish/ironfish:latest ironfish:latest
    ```

    In the future, the Iron Fish Tank will be improved to make this step
    unnecessary.

1.  **Check out and build the Iron Fish Tank repository:**

    ```sh
    git clone https://github.com/iron-fish/ironfish-tank.git
    cd ironfish-tank
    yarn build
    ```

1.  **Start your first cluster:**

    ```sh
    yarn start start cluster-name
    ```

    By doing so, the Iron Fish Tank will create a new isolated Docker network
    and spin up an Iron Fish bootstrap node. You can see the network via
    `docker network ls` and the container running the bootstrap node via
    `docker container ls`.

    Note that you can run multiple clusters in parallel: just make sure that
    you choose a different name every time.

1.  **Add some nodes:**

    ```sh
    yarn start spawn --cluster cluster-name node-name
    ```

    This will start a new node in the cluster with the default configuration.
    The node will connect to the bootstrap node that was launched when the
    cluster was created. You can see the container running the node via `docker
    container ls`. You can also try out `docker exec -i cluster-name_node-name
    ironfish peers` to see what the node is connected to.

    See `yarn start spawn --help` have an overview of the options you can use
    to customize the node.

1.  **Tear down the cluster:**

    ```sh
    yarn start stop cluster-name
    ```

    This will remove all containers, all networks, and all other resources that
    are part of the cluster.

[Docker]: https://www.docker.com/
