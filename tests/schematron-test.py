import json
import requests
from bs4 import BeautifulSoup
from ddgs import DDGS

def discover_url(query: str) -> str:
    """Searches the web based on the user query and returns the top URL."""
    print(f"[*] Searching the web for: '{query}'")
    results = DDGS().text(query, max_results=1)
    
    if not results:
        raise ValueError("No search results found.")
    
    url = results[0]['href']
    print(f"[*] Found target URL: {url}")
    return url

def fetch_and_clean_html(url: str) -> str:
    """Fetches HTML and strips out non-content tags to optimize for the LLM."""
    print(f"[*] Fetching HTML from {url}")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    response = requests.get(url, headers=headers, timeout=15)
    response.raise_for_status()
    

    soup = BeautifulSoup(response.text, 'lxml')
    
   
    for tag in soup(["script", "style", "svg", "nav", "footer", "form", "button"]):
        tag.decompose()
        
    cleaned_html = str(soup)
    print(f"[*] Cleaned HTML length: {len(cleaned_html)} characters.")
    return cleaned_html

def extract_with_schematron(html: str, schema: dict) -> dict:
    """Passes the cleaned HTML and schema to local Schematron-3B via Ollama."""
    print("[*] Running Schematron-3B extraction (this may take a moment)...")
    

    prompt = f"""You are going to be given a JSON schema following the standardized JSON. You are going to be given a HTML page and you are going to apply the schema to the HTML page however you see it as applicable and return the results in a JSON object. The schema is as follows:

{json.dumps(schema)}

Here is the HTML page:

{html}

MAKE SURE ITS VALID JSON."""

    payload = {
        "model": "Inference/Schematron:3B",
        "stream": False,
        "options": {
            "temperature": 0, 
            "num_ctx": 64000  
        },
        "messages": [
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": prompt}
        ],
        "format": schema 
    }
    
 
    response = requests.post("http://localhost:11434/api/chat", json=payload)
    response.raise_for_status()
    
    result = response.json()
    return json.loads(result["message"]["content"])

def main():
  
    user_query = "What are the core features and pricing of the Raspberry Pi 5?"
    
 
    target_schema = {
        "type": "object",
        "properties": {
            "product_name": {"type": "string"},
            "price": {"type": "string"},
            "processor": {"type": "string"},
            "key_features": {
                "type": "array",
                "items": {"type": "string"}
            }
        },
        "required": ["product_name", "price", "key_features"]
    }
    
    try:
 
        url = discover_url(user_query)
        html = fetch_and_clean_html(url)
        extracted_data = extract_with_schematron(html, target_schema)
        
        print("\n✅ Extraction Complete! Output:")
        print(json.dumps(extracted_data, indent=2))
        
    except Exception as e:
        print(f"\n❌ Pipeline failed: {e}")

if __name__ == "__main__":
    main()