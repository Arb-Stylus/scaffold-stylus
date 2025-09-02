# Welcome to Scaffold-Stylus Contributing Guide

Contributions are welcome and appreciated. The following sections provide information on how you can contribute to Scaffold-Stylus.

## Prerequisites

Before contributing to Scaffold-Stylus, please ensure you meet the following requirements:

- **Rust** (>=1.52.0)
- **Node.js** (>=v20.18)
- **Docker** (for local development)
- **Git** (for version control)

Read the [README](README.md) to get an overview of the project.

This repo follows the Conventional Commit specification when writing commit messages.

**Note:** It is important that any pull requests you submit have commit messages that follow this standard.

To start contributing:

1. **Fork this repo** and clone the fork locally.
2. **Create a new branch**
   ```bash
   git checkout -b <my-branch>
   ```
3. **Install dependencies**
   ```bash
   yarn install
   ```
4. **Set up development environment**
   ```bash
   # Start local network
   yarn chain
   
   # Deploy contracts
   yarn deploy
   
   # Start frontend
   yarn start
   ```

### Commit Message Format

Here is an example of a bad message response:

```bash
git commit -m "bad message"
⧗   input: bad message
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
```

Here is an example of a good message response:
```bash
git commit -m "fix: added missing dependency"
[my-branch 4c028af] fix: added missing dependency
1 file changed, 50 insertions(+)
```

- Search for existing Issues and PRs before creating your own.
- Contributions should only fix/add the functionality in the issue OR address style issues, not both.
- If you're running into an error, please give context. Explain what you're trying to do and how to reproduce the error.
- Please use the same formatting in the code repository. You can configure your IDE to do it by using the prettier / linting config files included in each package.
- If applicable, please edit the README.md file to reflect the changes.

### Development Workflow

After making your changes, ensure the following:

- **Build successfully**: `yarn build` runs without errors
- **Tests pass**: `yarn test` runs successfully
- **Code formatting**: `yarn format` formats your code
- **Linting**: `yarn lint` passes without errors
- **Contract tests**: `yarn stylus:test` passes for any contract changes

### Pull Request Process

1. **Fork the repository**
2. **Create a feature branch** from `main`
3. **Make your changes** following the development guidelines
4. **Test your changes** thoroughly
5. **Submit a pull request** against the `main` branch

### Pull Request Guidelines

- **Clear title**: Use a descriptive title that explains what the PR does
- **Detailed description**: Include context, changes made, and testing steps
- **Link issues**: Reference any related issues using `Fixes #123` or `Closes #123`
- **Screenshots**: Include screenshots for UI changes
- **Breaking changes**: Clearly mark any breaking changes

### Code Style

- Follow the existing code style and patterns
- Use TypeScript for type safety
- Add JSDoc comments for complex functions
- Keep functions small and focused
- Use meaningful variable and function names

### Testing

- Add tests for new features
- Update existing tests when modifying functionality
- Ensure all tests pass before submitting PR
- Test both happy path and edge cases

### Documentation

- Update README.md if you add new features
- Add JSDoc comments for new functions
- Update type definitions if needed
- Keep documentation up to date with code changes

## Community

Join our community and stay connected:

- 💬 [Telegram Support](https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA)
- 📚 [Documentation](https://arb-stylus.github.io/scaffold-stylus-docs/)
- 🌐 [Website](https://www.scaffoldstylus.com/)

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) since we expect project participants to adhere to it.

---

Thank you for contributing to Scaffold-Stylus! 🚀
