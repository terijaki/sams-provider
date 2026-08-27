Lambda handlers are thin: load SSM config, construct clients, call `src/` services, record sync metadata on failure.

Keep SAMS workarounds (null logos, SBVV association UUID) in `src/`, not duplicated in handlers.
