# Welcome Messages Configuration

The `welcome_messages.json` file allows you to configure custom welcome messages for users based on their attributes.

## Structure

```json
{
  "departments": {
    "department_name": "Welcome message with {{name}} placeholder"
  },
  "titles": {
    "job_title": "Welcome message with {{name}} placeholder"
  },
  "usernames": {
    "username": "Welcome message with {{name}} placeholder"
  },
  "default": "Default welcome message with {{name}} placeholder"
}
```

## Priority Order

Welcome messages are selected in the following priority order:
1. Username-specific message
2. Title-specific message
3. Department-specific message
4. Default message

## Placeholders

- `{{name}}`: Will be replaced with the user's name

## Example

```json
{
  "departments": {
    "engineering": "Welcome to the Engineering team, {{name}}!"
  },
  "titles": {
    "manager": "Welcome, Manager {{name}}."
  },
  "usernames": {
    "john.doe": "Welcome back, John!"
  },
  "default": "Hello {{name}}!"
}
```

## How to Update

Simply edit the `welcome_messages.json` file to add, modify, or remove welcome messages. The changes will take effect immediately without requiring a server restart.