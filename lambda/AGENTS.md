Lambda handlers are thin: load SSM config, construct clients, call `src/` services, record sync metadata on failure.

Keep SAMS workarounds (null logos, associations omitted from paginated lists) in `src/`, not duplicated in handlers.
