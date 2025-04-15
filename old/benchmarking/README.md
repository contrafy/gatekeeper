# Policy Benchmark Tool

A comprehensive benchmarking tool for evaluating IAM policy generation systems.

## Overview

This tool measures how accurately models can convert natural language requests into Google Cloud IAM policy bindings. It provides detailed metrics, visualizations, and comparison capabilities to track improvements across different models or versions of your policy generation system.

## Features

- Evaluates policy generation accuracy across multiple metrics
- Compares different models side-by-side
- Generates visualizations and detailed reports
- Handles complex JSON comparison with normalization
- Supports testing with sample subsets

## Requirements

- Python 3.6+
- OpenAI API key (for testing OpenAI models)
- Required packages: `pandas`, `matplotlib`, `numpy`, `tqdm`, `openai`

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   pip install pandas matplotlib numpy tqdm openai
   ```
3. Set your OpenAI API key as an environment variable:
   ```
   export OPENAI_API_KEY=your_api_key_here
   ```

## Usage

### Basic Benchmarking

Test a model on a dataset:

```bash
python benchmark_script.py --test_data policy_data.csv --model gpt-4o-mini
```

### Testing with a Sample

Test on a random subset of examples:

```bash
python benchmark_script.py --test_data policy_data.csv --model gpt-4o-mini --sample_size 50
```

### Multi-Model Comparison

Compare performance across multiple models:

```bash
python benchmark_script.py --test_data policy_data.csv --multi_model
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--test_data` | Path to test data file (CSV or JSONL) | Required |
| `--model` | Model to benchmark | gpt-4o-mini |
| `--sample_size` | Number of examples to sample | All examples |
| `--results_dir` | Directory to store results | benchmark_results |
| `--multi_model` | Run benchmark on multiple models | False |

## Metrics

The benchmark measures and reports:

- **Success Rate**: Percentage of perfectly generated policies
- **Valid JSON Rate**: Percentage of responses with valid JSON
- **Correct Format Rate**: Percentage with correct IAM policy structure
- **Average Similarity**: How close generated policies are to expected ones
- **Average Latency**: Response time in seconds

## Output Files

Each benchmark run produces:

1. **JSON Report**: Detailed results including all test cases
   ```
   benchmark_results/benchmark_20250226_202701.json
   ```

2. **CSV Summary**: Aggregated metrics for easy analysis
   ```
   benchmark_results/summary_20250226_202701.csv
   ```

3. **Visualization**: Comparison charts for accuracy and latency
   ```
   benchmark_results/visualization_20250226_202701.png
   ```

## Visualization Example

The tool generates charts comparing:

- Success rate, valid JSON rate, and correct format rate
- Similarity scores across different models
- Response latency for performance evaluation

## Extending the Tool

### Adding New Model Types

The tool is designed to be extended to other model providers. To add support for a new model:

1. Extend the `query_model` method in the `PolicyBenchmark` class
2. Add appropriate authentication and API calls
3. Ensure the response format matches existing expectations

### Custom Metrics

You can customize the evaluation metrics by modifying the `calculate_metrics` method.

## License

[MIT License](LICENSE)