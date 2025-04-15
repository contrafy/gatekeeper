# Policy Data Generator

A tool for creating synthetic GCloud IAM policy datasets for training and evaluation.

## Overview

This generator creates diverse examples of natural language requests paired with correctly formatted Google Cloud IAM policy bindings. The generated data can be used to:

- Train machine learning models to convert natural language requests into IAM policies
- Create benchmarking datasets to evaluate policy generation systems
- Support development of automated policy management tools

## Features

- Generates diverse policy scenarios across multiple GCP service domains
- Creates policies with varying complexity (simple, multi-role, conditions, etc.)
- Supports all common IAM member types (users, service accounts, groups)
- Includes time-based expiration conditions
- Optional AI-assisted validation using OpenAI

## Requirements

- Python 3.6+
- OpenAI API key (TODO: add support for other providers, mainly Gemini)

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   pip install openai
   ```
3. Set your OpenAI API key as an environment variable:
   ```
   export OPENAI_API_KEY=your_api_key_here
   ```

## Usage

### Basic Generation

Generate 100 synthetic examples:

```bash
python policy_generator.py --num_examples 100
```

This will create:
- `policy_data.jsonl`: JSONL format for fine-tuning
- `policy_data.csv`: CSV format for easier inspection

### AI-Assisted Generation

Use OpenAI to validate and improve the generated examples:

```bash
python policy_generator.py --num_examples 50 --use_openai --model gpt-4o-mini
```

### Flags

| Option | Description | Default |
|--------|-------------|---------|
| `--num_examples` | Number of examples to generate | 100 |
| `--output_file` | Output file name | policy_data.jsonl |
| `--use_openai` | Use OpenAI for validation | False |
| `--model` | OpenAI model to use | gpt-4o-mini |

## Output Format

### JSONL for Fine-tuning

Each example is formatted as a conversation with system, user, and assistant messages:

```json
{
  "messages": [
    {"role": "system", "content": "You are an expert in Google Cloud IAM policies..."},
    {"role": "user", "content": "Grant user dev@example.com the Storage Admin role"},
    {"role": "assistant", "content": "{\n \"bindings\": [\n {\n \"role\": \"roles/storage.admin\",\n \"members\": [\n \"user:dev@example.com\"\n ]\n }\n ]\n}"}
  ]
}
```

### CSV format

A simple two-column format with request text and expected policy:

```
Request Text,Response Policy
"Grant user dev@example.com the Storage Admin role","{...}"
```

## Example Outputs

The generator creates examples ranging from simple to complex:

**Simple policy:**
```
"Grant service account data-pipeline@project.iam.gserviceaccount.com the BigQuery Data Editor role"
```

**Multi-role policy with condition:**
```
"Our security team needs access to monitoring and logging, represented by group security@example.com. This access should expire in 6 months."
```

## License

[MIT License](LICENSE)