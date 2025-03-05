import os
import sys
import json
import argparse
import csv
import time
from datetime import datetime
import re
import matplotlib.pyplot as plt
import numpy as np
import hashlib
from difflib import SequenceMatcher

# Load API keys
openai.api_key = os.environ.get("OPENAI_API_KEY")
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

# Initialize API clients if keys are present
if openai.api_key:
    import openai
if GOOGLE_API_KEY:
    from google import genai
    from google.genai import types
    gemini_client = genai.Client(api_key=GOOGLE_API_KEY)
if GROQ_API_KEY:
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY)

# Check if at least one API key is available
if not (openai.api_key or GOOGLE_API_KEY or GROQ_API_KEY):
    raise ValueError("Please set at least one of OPENAI_API_KEY, GOOGLE_API_KEY, or GROQ_API_KEY environment variables")

class PolicyBenchmark:
    def __init__(self, config=None):
        self.config = config or {}
        self.results_dir = self.config.get("results_dir", "benchmark_results")
        os.makedirs(self.results_dir, exist_ok=True)
        
        # Set up results tracking
        self.benchmark_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.results = {
            "benchmark_id": self.benchmark_id,
            "timestamp": datetime.now().isoformat(),
            "config": self.config,
            "model_results": {}
        }

        # Check available API providers
        self.available_providers = []
        if os.environ.get("OPENAI_API_KEY"):
            self.available_providers.append("openai")
        if os.environ.get("GOOGLE_API_KEY"):
            self.available_providers.append("gemini")
        if os.environ.get("GROQ_API_KEY"):
            self.available_providers.append("groq")

        if not self.available_providers:
            raise ValueError("No API keys found. Please set at least one of OPENAI_API_KEY, GOOGLE_API_KEY, or GROQ_API_KEY")
        
        # Define system prompt
        self.default_system_prompt = """
        You are an expert in Google Cloud IAM policies. Your task is to convert natural language requests 
        into correctly formatted GCloud IAM policy bindings JSON. The output should be a valid JSON 
        policy that can be absorbed by the GCloud IAM API. The policy should define bindings of roles 
        to members (users, service accounts, or groups) and may include conditions such as time-based 
        expirations. Ensure all role names are fully qualified (e.g., roles/storage.objectViewer).
        
        IMPORTANT: Return ONLY the JSON policy with no explanations or markdown formatting.
        """
    
    def load_test_data(self, file_path):
        print(file_path)
        """Load test data from file (CSV or JSONL)"""
        extension = os.path.splitext(file_path)[1].lower()
        
        if extension == '.csv':
            test_data = []
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    test_data.append({
                        "request_text": row.get("Request Text", ""),
                        "expected_policy": row.get("Response Policy", "")
                    })
        elif extension == '.jsonl':
            test_data = []
            with open(file_path, 'r', encoding='utf-8') as f:
                for line in f:
                    item = json.loads(line)
                    # Extract from OpenAI fine-tuning format if needed
                    if "messages" in item:
                        messages = item["messages"]
                        request = next((m["content"] for m in messages if m["role"] == "user"), "")
                        response = next((m["content"] for m in messages if m["role"] == "assistant"), "")
                        test_data.append({
                            "request_text": request,
                            "expected_policy": response
                        })
                    else:
                        test_data.append({
                            "request_text": item.get("request_text", ""),
                            "expected_policy": item.get("policy", "")
                        })
        else:
            raise ValueError(f"Unsupported file extension: {extension}")
        
        return test_data
    
    def extract_json_from_response(self, text):
        """Extract JSON from a response that might contain explanatory text"""
        # Try to find JSON within markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if json_match:
            json_str = json_match.group(1).strip()
            try:
                # Try to parse with standard json first
                return json.loads(json_str)
            except:
                # For more lenient parsing, we could implement a custom parser
                # but for now we'll just continue with other methods
                pass
        
        # Try to find content within curly braces
        json_match = re.search(r'({[\s\S]*})', text)
        if json_match:
            json_str = json_match.group(1).strip()
            try:
                return json.loads(json_str)
            except:
                try:
                    return json5.loads(json_str)
                except:
                    pass
        
        # Try to parse the entire text
        try:
            return json.loads(text)
        except:
            try:
                return json5.loads(text)
            except:
                return None
    
    def normalize_policy(self, policy_json):
        """Normalize a policy JSON for consistent comparison"""
        if isinstance(policy_json, str):
            try:
                # First try standard JSON parsing
                policy_json = json.loads(policy_json)
            except:
                try:
                    # Replace double-escaped quotes with single quotes
                    cleaned_json = policy_json.replace('""', '"')
                    policy_json = json.loads(cleaned_json)
                except:
                    # Try more aggressive cleaning for common CSV issues
                    try:
                        # Sometimes there are extra backslashes
                        cleaned_json = policy_json.replace('\\', '').replace('""', '"')
                        policy_json = json.loads(cleaned_json)
                    except:
                        # One last attempt with even more aggressive cleaning
                        try:
                            import re
                            # Extract what looks like JSON
                            json_match = re.search(r'({[\s\S]*})', policy_json)
                            if json_match:
                                extracted = json_match.group(1).replace('""', '"')
                                policy_json = json.loads(extracted)
                            else:
                                return None
                        except:
                            return None
        
        # Ensure we have a valid policy
        if not isinstance(policy_json, dict) or "bindings" not in policy_json:
            return None
        
        # Normalize each binding
        for binding in policy_json.get("bindings", []):
            # Sort members
            if "members" in binding:
                binding["members"] = sorted(binding["members"])
            
            # Handle roles that might be a list or a string
            if "role" in binding and isinstance(binding["role"], list):
                roles = binding.pop("role")
                binding["role"] = roles[0]  # Keep first role
                
                # Create additional bindings for the extra roles
                for extra_role in roles[1:]:
                    new_binding = binding.copy()
                    new_binding["role"] = extra_role
                    policy_json["bindings"].append(new_binding)
        
        # Sort bindings by role for consistency
        policy_json["bindings"] = sorted(
            policy_json["bindings"], 
            key=lambda x: (x.get("role", ""), tuple(x.get("members", [])))
        )
        
        return policy_json

    def evaluate_generated_policy(self, generated, expected):
        """Evaluate a generated policy against the expected policy"""
        # Extract and normalize policies
        generated_json = self.extract_json_from_response(generated)
        
        if isinstance(expected, str):
            try:
                expected_json = json.loads(expected)
            except:
                try:
                    # Handle double-escaped quotes from CSV
                    cleaned_expected = expected.replace('""', '"')
                    expected_json = json.loads(cleaned_expected)
                except:
                    # Try more aggressive cleaning
                    try:
                        cleaned_expected = expected.replace('\\', '').replace('""', '"')
                        expected_json = json.loads(cleaned_expected)
                    except:
                        expected_json = None
        else:
            expected_json = expected
            
        if generated_json is None or expected_json is None:
            return {
                "valid_json": generated_json is not None,
                "correct_format": False,
                "similarity": 0.0,
                "passed": False
            }
            
        # Normalize for comparison
        normalized_generated = self.normalize_policy(generated_json)
        normalized_expected = self.normalize_policy(expected_json)
        
        if normalized_generated is None or normalized_expected is None:
            return {
                "valid_json": True,
                "correct_format": False,
                "similarity": 0.0,
                "passed": False
            }
            
        # Calculate similarity
        similarity = self.calculate_policy_similarity(normalized_generated, normalized_expected)
        
        # More lenient similarity check for timestamp formats and condition titles
        # Timestamps might differ slightly but still be valid
        if similarity > 0.7 and similarity < 0.9:
            # Check if the only differences are in condition title or timestamp format
            gen_str = json.dumps(normalized_generated, sort_keys=True)
            exp_str = json.dumps(normalized_expected, sort_keys=True)
            
            # Replace condition titles and timestamp formats for comparison
            gen_normalized = re.sub(r'"title":\s*"[^"]*"', '"title": "NORMALIZED"', gen_str)
            exp_normalized = re.sub(r'"title":\s*"[^"]*"', '"title": "NORMALIZED"', exp_str)
            
            gen_normalized = re.sub(r'timestamp\([^\)]*\)', 'timestamp(NORMALIZED)', gen_normalized)
            exp_normalized = re.sub(r'timestamp\([^\)]*\)', 'timestamp(NORMALIZED)', exp_normalized)
            
            if gen_normalized == exp_normalized:
                similarity = 0.95  # Consider them essentially equal
        
        # Check for correct structure
        correct_format = "bindings" in normalized_generated
        
        return {
            "valid_json": True,
            "correct_format": correct_format,
            "similarity": similarity,
            "passed": similarity > 0.8  # More lenient threshold (was 0.9)
        }

    def calculate_policy_similarity(self, policy1, policy2):
        """Calculate similarity between two policies"""
        # Convert to strings for comparison
        if isinstance(policy1, dict):
            policy1 = json.dumps(policy1, sort_keys=True)
        if isinstance(policy2, dict):
            policy2 = json.dumps(policy2, sort_keys=True)
            
        # Use sequence matcher to get similarity ratio
        return SequenceMatcher(None, policy1, policy2).ratio()

    def query_model(self, model_name, prompt, system_prompt=None, max_tokens=1000, temperature=0.2, model_type="openai"):
        """Query a model with the given prompt"""
        response_obj = {"content": "", "latency": 0, "status_code": 200}

        if model_type == "openai":
            # Handle different model architectures
            if system_prompt:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
                
                start_time = time.time()
                try:
                    response = openai.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        max_tokens=max_tokens,
                        temperature=temperature
                    )
                    response_obj["content"] = response.choices[0].message.content
                    response_obj["status_code"] = 200
                except Exception as e:
                    response_obj["content"] = str(e)
                    if hasattr(e, 'status_code'):
                        response_obj["status_code"] = e.status_code
                end_time = time.time()
                
                response_obj["latency"] = end_time - start_time
                return response_obj
            else:
                # Legacy completions API (deprecated but included for completeness)
                start_time = time.time()
                try:
                    response = openai.chat.completions.create(
                        model=model_name,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                        temperature=temperature
                    )
                    response_obj["content"] = response.choices[0].message.content
                    response_obj["status_code"] = 200
                except Exception as e:
                    response_obj["content"] = str(e)
                    if hasattr(e, 'status_code'):
                        response_obj["status_code"] = e.status_code
                end_time = time.time()
                
                response_obj["latency"] = end_time - start_time
                return response_obj
        elif model_type == "gemini":
            start_time = time.time()
            
            # Create content with system instruction if provided
            if system_prompt:
                generation_config = genai.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=max_tokens,
                )
                
                safety_settings = types.SafetySetting(
                    category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                )
                
                # Construct a ChatSession
                model = gemini_client.get_model(model_name)
                chat = model.start_chat(
                    history=[],
                    generation_config=generation_config,
                    safety_settings=[safety_settings],
                    system_instruction=system_prompt,
                )
                
                response = chat.send_message(prompt)
            else:
                # Simple content generation without system prompt
                response = gemini_client.generate_content(
                    model=model_name,
                    contents=prompt,
                    generation_config={
                        "temperature": temperature,
                        "max_output_tokens": max_tokens,
                    }
                )
            
            end_time = time.time()
            
            # Extract the text from the response
            try:
                response_text = response.text
            except AttributeError:
                # For older API versions or different response structures
                try:
                    response_text = response.candidates[0].content.parts[0].text
                except:
                    response_text = str(response)
            
            result = {
                "content": response_text,
                "latency": end_time - start_time
            }
            return result
        elif model_type == "groq":
            # Groq handling
            start_time = time.time()
            
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            messages.append({"role": "user", "content": prompt})
            
            response = groq_client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature
            )
            end_time = time.time()
            
            result = {
                "content": response.choices[0].message.content,
                "latency": end_time - start_time
            }
            return result
        else:
            raise ValueError(f"Unsupported model type: {model_type}")

def run_benchmark(self, model_config, test_data, sample_size=None):
    """Run benchmark for a specific model configuration"""
    model_name = model_config.get("name", "unknown")
    model_type = model_config.get("type", "openai")
    system_prompt = model_config.get("system_prompt", self.default_system_prompt)
    temperature = model_config.get("temperature", 0.2)
    max_tokens = model_config.get("max_tokens", 1000)
    
    # Create a unique key for the model in results
    model_key = f"{model_name}-{model_type}"
    
    print(f"Running benchmark for model: {model_name} of type {model_type}")
    
    # Sample data if requested
    if sample_size and sample_size < len(test_data):
        import random
        sampled_data = random.sample(test_data, sample_size)
    else:
        sampled_data = test_data
        
    results = []
    last_status = None

    # Initialize progress bar
    update_progress(0, len(sampled_data), model_name, model_type)
    
    for i, item in enumerate(sampled_data):
        request_text = item["request_text"]
        expected_policy = item["expected_policy"]
        
        # Unique ID for this test case
        test_id = hashlib.md5(request_text.encode()).hexdigest()
        
        try:
            # Query the model
            response = self.query_model(
                model_name=model_name,
                prompt=request_text,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                model_type=model_type
            )
            
            # Update status only for non-200 responses
            if hasattr(response, 'status_code') and response.status_code != 200:
                last_status = f"HTTP Response ({model_type}): {response.status_code}"
            else:
                last_status = None
                
            # Evaluate the response
            evaluation = self.evaluate_generated_policy(
                response["content"], 
                expected_policy
            )
            
            result = {
                "test_id": test_id,
                "request": request_text,
                "expected": expected_policy,
                "generated": response["content"],
                "latency": response["latency"],
                "evaluation": evaluation
            }
            
            results.append(result)
            
            # Update progress bar
            update_progress(i + 1, len(sampled_data), model_name, model_type, last_status)
            
            # Throttle requests to avoid rate limits
            time.sleep(model_config.get("request_delay", 0.5))
            
        except Exception as e:
            last_status = f"Error: {str(e)}"
            update_progress(i + 1, len(sampled_data), model_name, model_type, last_status)
            
            results.append({
                "test_id": test_id,
                "request": request_text,
                "expected": expected_policy,
                "error": str(e)
            })
            time.sleep(1)  # Longer delay on error
    
    # Final newline after progress bar completion
    print("\n")
    
    # Compile aggregated metrics
    metrics = self.calculate_metrics(results)
    
    # Store results using the unique model key
    model_results = {
        "model_config": model_config,
        "metrics": metrics,
        "test_results": results
    }
    
    self.results["model_results"][model_key] = model_results
    
    return metrics

def calculate_metrics(self, results):
    """Calculate aggregated metrics from test results"""
    total_tests = len(results)
    successful_tests = sum(1 for r in results if "evaluation" in r and r["evaluation"].get("passed", False))
    
    # Filter out tests with errors
    valid_results = [r for r in results if "evaluation" in r]
    
    if valid_results:
        avg_similarity = sum(r["evaluation"].get("similarity", 0) for r in valid_results) / len(valid_results)
        avg_latency = sum(r.get("latency", 0) for r in valid_results) / len(valid_results)
    else:
        avg_similarity = 0
        avg_latency = 0
    
    return {
        "total_tests": total_tests,
        "successful_tests": successful_tests,
        "success_rate": successful_tests / total_tests if total_tests > 0 else 0,
        "avg_similarity": avg_similarity,
        "avg_latency": avg_latency
    }

def save_results(self):
    """Save benchmark results to file"""
    # Create a unique filename with the benchmark ID
    filename = f"{self.results_dir}/benchmark_{self.benchmark_id}.json"
    
    with open(filename, 'w') as f:
        json.dump(self.results, f, indent=2)
    
    print(f"Benchmark results saved to {filename}")
    
    # Also save a summary CSV
    summary_file = f"{self.results_dir}/summary_{self.benchmark_id}.csv"
    with open(summary_file, 'w', newline='') as f:
        writer = csv.writer(f)
        
        # Write header
        writer.writerow([
            "Model", "Success Rate", "Avg Similarity", "Avg Latency (s)"
        ])
        
        # Write data
        for model_name, model_result in self.results["model_results"].items():
            metrics = model_result["metrics"]
            writer.writerow([
                model_name,
                f"{metrics['success_rate']:.2%}",
                f"{metrics['avg_similarity']:.4f}",
                f"{metrics['avg_latency']:.3f}"
            ])
    
    print(f"Summary saved to {summary_file}")
    
    return filename

def visualize_results(self, display_names = None):
    """Generate visualizations of benchmark results"""
    # Set up the plot
    plt.figure(figsize=(12, 8))
    
    # Extract model names and metrics
    model_names = []
    success_rates = []
    similarities = []
    latencies = []
    
    for model_key, model_result in self.results["model_results"].items():
        metrics = model_result["metrics"]
        # Use model_config to get the provider type and model name
        model_config = model_result["model_config"]
        model_type = model_config.get("type", "unknown")
        model_name = model_config.get("name", "unknown")
        
        # Create a display name that includes provider
        display_name = f"{model_name} ({model_type})"
        
        model_names.append(display_name)
        success_rates.append(metrics["success_rate"] * 100)
        similarities.append(metrics["avg_similarity"] * 100)
        latencies.append(metrics["avg_latency"])
    
    if display_names and len(display_names) == len(model_names):
        model_names = display_names

    # Set width of bars
    bar_width = 0.2
    x = np.arange(len(model_names))
    
    # Create subplots
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 10))
    
    # Plot accuracy metrics
    ax1.bar(x - bar_width*1.5, success_rates, bar_width, label='Success Rate')
    ax1.bar(x + bar_width*1.5, similarities, bar_width, label='Similarity (%)')
    
    ax1.set_xlabel('Models')
    ax1.set_ylabel('Percentage (%)')
    ax1.set_title('Policy Generation Accuracy Metrics')
    ax1.set_xticks(x)
    ax1.set_xticklabels(model_names, rotation=45, ha='right')
    ax1.legend()
    ax1.grid(axis='y', linestyle='--', alpha=0.7)
    
    # Plot latency
    ax2.bar(x, latencies, color='green', alpha=0.7)
    ax2.set_xlabel('Models')
    ax2.set_ylabel('Average Latency (seconds)')
    ax2.set_title('Model Response Time')
    ax2.set_xticks(x)
    ax2.set_xticklabels(model_names, rotation=45, ha='right')
    ax2.grid(axis='y', linestyle='--', alpha=0.7)
    
    plt.tight_layout()
    
    # Save visualization
    vis_file = f"{self.results_dir}/visualization_{self.benchmark_id}.png"
    plt.savefig(vis_file)
    plt.close()
    
    print(f"Visualization saved to {vis_file}")
    
    return vis_file

def main():
    # Set up logging for better diagnostics
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler("benchmark_debug.log"),
            logging.StreamHandler()
        ]
    )
    
    parser = argparse.ArgumentParser(description="Benchmark GCP IAM policy generation models")
    parser.add_argument("--test_data", type=str, required=True, 
                        help="Path to test data file (CSV or JSONL)")
    parser.add_argument("--providers", type=str, nargs='+', default=None,
                        help="Model providers to benchmark (space-separated list: openai gemini groq)")
    parser.add_argument("--models", type=str, nargs='+', default=None,
                        help="Specific models to benchmark (space-separated list: gpt-4o-mini llama-3.3-70b-versatile)")
    parser.add_argument("--sample_size", type=int, default=None,
                        help="Number of test cases to sample (default: all)")
    parser.add_argument("--results_dir", type=str, default="benchmark_results",
                        help="Directory to store benchmark results")
    
    args = parser.parse_args()
    
    try:
        # Initialize benchmark
        benchmark = PolicyBenchmark({
            "results_dir": args.results_dir
        })
        
        # Load test data
        logging.info(f"Loading test data from {args.test_data}")
        test_data = benchmark.load_test_data(args.test_data)
        logging.info(f"Loaded {len(test_data)} test cases")

        # Get models to benchmark
        models_to_benchmark = get_models_to_benchmark(benchmark, args)
        logging.info(f"Selected {len(models_to_benchmark)} models for benchmarking: {models_to_benchmark}\n\n")
        
        # Run benchmarks for each selected model
        for model_config in models_to_benchmark:
            benchmark.run_benchmark(
                model_config=model_config,
                test_data=test_data,
                sample_size=args.sample_size
            )

        # Save and visualize results
        benchmark.save_results()
        benchmark.visualize_results()
    
    except Exception as e:
        logging.exception(f"Error in benchmark execution: {str(e)}")
        # Print traceback for easier debugging
        import traceback
        traceback.print_exc()

def update_progress(iteration, total, model_name, provider, last_status=None):
    """
    Update progress bar in place
    """
    percent = ("{0:.0f}").format(100 * (iteration / float(total)))
    filled_length = int(50 * iteration // total)
    bar = '█' * filled_length + '-' * (50 - filled_length)
    
    # Clear the current line
    sys.stdout.flush()
    sys.stdout.write('\r')
    sys.stdout.write(f"{percent}%|{bar}| {iteration}/{total}\n")
    
    # Add status message if provided
    if last_status:
        sys.stdout.write(f"\n{last_status}")
        
    sys.stdout.flush()

def get_models_to_benchmark(benchmark, args):
    """Get the list of models to benchmark based on command line arguments"""
    # Available models by provider
    available_models = {
        "openai": [
            {"name": "gpt-4o-mini", "type": "openai", "temperature": 0.2, "request_delay": 0.5},
            {"name": "gpt-3.5-turbo", "type": "openai", "temperature": 0.2, "request_delay": 0.5}
        ],
        "gemini": [
            {"name": "gemini-1.5-pro", "type": "gemini", "temperature": 0.2, "request_delay": 0.5}
        ],
        "groq": [
            {"name": "gemma2-9b-it", "type": "groq", "temperature": 0.2, "request_delay": 0.5},
            {"name": "llama-3.3-70b-versatile", "type": "groq", "temperature": 0.2, "request_delay": 0.5},
            {"name": "llama3-8b-8192", "type": "groq", "temperature": 0.2, "request_delay": 0.5}
        ]
    }
    
    # Check which providers are available
    available_providers = []
    for provider in ["openai", "gemini", "groq"]:
        if provider in benchmark.available_providers:
            available_providers.append(provider)
    
    models_to_benchmark = []
    
    # If specific providers are requested
    if args.providers:
        # Filter to only available providers
        requested_providers = [p for p in args.providers if p in available_providers]
        if not requested_providers:
            raise ValueError(f"None of the requested providers {args.providers} are available. Available providers: {available_providers}")
        
        # If specific models are provided
        if args.models:
            # Find all models that match both provider and model name
            for provider in requested_providers:
                provider_models = available_models.get(provider, [])
                for model_config in provider_models:
                    if model_config["name"] in args.models:
                        models_to_benchmark.append(model_config)
        # No specific models, use all models from requested providers
        else:
            for provider in requested_providers:
                models_to_benchmark.extend(available_models.get(provider, []))
    else:
        raise ValueError("No valid providers selected for benchmarking (use --providers)")
    
    # If we still have no models, raise error
    if not models_to_benchmark:
        raise ValueError("No valid models selected for benchmarking")
    
    return models_to_benchmark

# Add these method declarations to the PolicyBenchmark class
PolicyBenchmark.run_benchmark = run_benchmark
PolicyBenchmark.calculate_metrics = calculate_metrics
PolicyBenchmark.save_results = save_results
PolicyBenchmark.visualize_results = visualize_results

if __name__ == "__main__":
    main()
