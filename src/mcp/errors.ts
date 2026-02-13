/**
 * MCP server error categories and error classes
 * Per spec 03-mcp-server.md
 */

export type ErrorCategory =
  | 'validation_error'
  | 'not_found'
  | 'rule_violation'
  | 'precondition_error'
  | 'infrastructure_error';

export class MapsError extends Error {
  constructor(
    public category: ErrorCategory,
    message: string
  ) {
    super(message);
    this.name = 'MapsError';
  }
}

export class ValidationError extends MapsError {
  constructor(message: string) {
    super('validation_error', message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends MapsError {
  constructor(message: string) {
    super('not_found', message);
    this.name = 'NotFoundError';
  }
}

export class RuleViolationError extends MapsError {
  constructor(message: string) {
    super('rule_violation', message);
    this.name = 'RuleViolationError';
  }
}

export class PreconditionError extends MapsError {
  constructor(message: string) {
    super('precondition_error', message);
    this.name = 'PreconditionError';
  }
}

export class InfrastructureError extends MapsError {
  constructor(message: string) {
    super('infrastructure_error', message);
    this.name = 'InfrastructureError';
  }
}
