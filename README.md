# SAMS provider

Central SAMS sync service. It owns the upstream volleyball API integration, stores a durable provider-side read model, and publishes app-oriented events to consumer queues.

This is not a proxy and not a public query API. Consumer websites keep their own local projections.

See [docs/SETUP.md](docs/SETUP.md) for local development, AWS accounts, and CI. Consumer registration is documented in [src/cli/README.md](src/cli/README.md).

Tracked in [issue #1](https://github.com/terijaki/sams-provider/issues/1).
