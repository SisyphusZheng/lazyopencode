# Job State Machine

## States

- `running`: task has launched and may still produce output
- `completed`: task ended successfully and is terminal unreconciled
- `error`: task ended with an error and is terminal unreconciled
- `cancelled`: task was cancelled and is terminal unreconciled
- `reconciled`: successful completed task acknowledged by the parent session
- `stale`: task was running before process restart and cannot be trusted as running

## Transitions

- launch -> `running`
- task output completed -> `completed` + terminal unreconciled
- task output error -> `error` + terminal unreconciled
- task output cancelled -> `cancelled` + terminal unreconciled
- session idle reconcile completed -> `reconciled`
- persisted running load -> `stale`
- session deleted -> removed

## Reusable Sessions

`reusable` is derived, not stored as a state.

A job is reusable only when:

- state is `reconciled`
- terminal unreconciled is false

`error`, `cancelled`, and `stale` jobs are never reusable.

## Restart Recovery

Persisted `running` jobs become `stale` after load. They remain visible in `/lazy status` so the user can see the interrupted work, but they are not reused.
