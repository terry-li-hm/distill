# Distill

An Obsidian plugin that refines web articles into atomic notes through structured dialogue between ChatGPT and Claude.

## How It Works

Distill uses a multi-phase AI dialogue to extract high-quality atomic notes from articles:

1. **Interpretation Phase**: Both ChatGPT and Claude read the article and share their interpretations, exchanging comments until they align on the core meaning.

2. **Drafting Phase**: ChatGPT drafts atomic notes based on the aligned interpretation. Each note is a self-contained paragraph with an H3 heading and a naturally embedded link to the source.

3. **Refinement Loop**: Claude critiques the draft, ChatGPT revises based on feedback, and the cycle repeats until Claude approves (typically 2-3 passes).

4. **User Approval**: Review the generated notes and select which ones to keep.

5. **Output**: Approved notes are appended to your Inbox note.

## Installation

### From Source

1. Clone this repository into your vault's `.obsidian/plugins/` directory:
   ```bash
   cd /path/to/vault/.obsidian/plugins/
   git clone https://github.com/yourusername/distill.git
   ```

2. Install dependencies and build:
   ```bash
   cd distill
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian: Settings → Community plugins → Enable "Distill"

## Configuration

1. Get an API key from [OpenRouter](https://openrouter.ai/keys)
2. Go to Settings → Distill
3. Enter your OpenRouter API key
4. (Optional) Customize model selection and dialogue settings

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| OpenRouter API Key | Your API key for accessing AI models | - |
| Drafter Model | Model used for drafting notes | GPT-4o |
| Critic Model | Model used for critiquing notes | Claude 4 Sonnet |
| Max Interpretation Rounds | Maximum rounds for interpretation alignment | 3 |
| Max Refinement Rounds | Maximum draft-critique cycles | 3 |
| Inbox Note Path | Where approved notes are appended | Inbox.md |

## Usage

1. Run the command **"Distill: Distill article from URL"** (Cmd/Ctrl+P → type "distill")
2. Paste an article URL
3. Wait for the dialogue to complete (progress is shown)
4. Review and approve the generated atomic notes
5. Notes are appended to your Inbox

## Example Output

```markdown
### Delegating credentials turns convenience into delegated authority

The setup path in [Skills Training](https://example.com/article) looks simple until you account for what the token authorizes: spending money on compute and publishing artifacts under your identity. That turns the agent from "helpful automation" into something closer to delegated authority, which is why early throwaway runs on non-sensitive data are a practical necessity—not paranoia.
```

## Development

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build
```

## Why This Architecture?

- **Convergence anchors interpretation**: Having both models align on meaning before note-taking prevents the refinement loop from oscillating around different readings.
- **Role specialization**: ChatGPT tends to draft smoother prose; Claude tends to catch issues and sharpen expression.
- **Built-in stopping criterion**: The loop stops when Claude judges further iteration would yield only marginal gains, preventing over-polishing.

## License

MIT
