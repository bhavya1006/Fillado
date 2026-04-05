import httpx
import asyncio
import os
from groq import Groq
from dotenv import load_dotenv
load_dotenv()
import logging
logger = logging.getLogger(__name__)
async def fetch_et_news(query: str, timeframe: str = "7d") -> dict:
    """
    Live news fetcher using NewsData.io API targeted at The Economic Times.
    Falls back to fetch_et_news_mock on any error.
    MCP Tool: fetch_et_news
    """

    
    # Put your API key in .env as NEWSDATA_API_KEY
    api_key = os.getenv("NEWSDATA_API_KEY")
    try:
        logger.info(f"[fetch_et_news] Fetching live ET news via API for: '{query}'")
        print(f"\n[MCP LIVE] 📰 Fetching NewsData API for: '{query}'")

        # 1. Fetch from the API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://newsdata.io/api/1/latest",
                params={
                    "apikey": api_key,
                    "q": query,
                    "country": "in",
                    "domainurl": "economictimes.indiatimes.com", # Force Economic Times
                    "language": "en"
                },
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()

        results = data.get("results", [])
        if not results:
            print(f"[MCP LIVE] ⚠️ No live news found, falling back to mock")
            # return fetch_et_news_mock(query, timeframe)

        # Extract the top 3 articles
        articles = []
        raw_text_for_summary = ""
        for i, item in enumerate(results[:3]):
            articles.append({
                "headline": item.get("title"),
                "source": item.get("source_id", "Economic Times"),
                "date": item.get("pubDate"),
                "url": item.get("link")
            })
            raw_text_for_summary += f"Headline: {item.get('title')}\nDescription: {item.get('description')}\n\n"

        # 2. Use the blazing fast 8B model to synthesize the market impact
        groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        summary_prompt = (
            f"Based on the following recent news articles about '{query}', write a 2-sentence "
            f"summary focusing strictly on the financial and supply chain impact, and list any mentioned companies.\n\n{raw_text_for_summary}"
        )
        
        summary_response = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": summary_prompt}],
            model="llama-3.1-8b-instant",
            temperature=0.2
        )
        
        impact_summary = summary_response.choices[0].message.content.strip()

        print(f"[MCP LIVE] ✅ News fetched and summarized successfully.")

        return {
            "tool": "fetch_et_news",
            "mode": "live",
            "query": query,
            "grounding_summary": impact_summary,
            "articles": articles,
            "article_count": len(articles)
        }

    except Exception as exc:
        # logger.error(f"[fetch_et_news] NewsData API failed: {exc} — using mock fallback")
        print(f"[MCP LIVE] ⚠️ NewsData API failed ({exc}), falling back to mock")
        # result = fetch_et_news_mock(query, timeframe)
        # result["tool"] = "fetch_et_news"
        # result["mode"] = "mock_fallback"
        # return result

news= asyncio.run(fetch_et_news("NSE"))
print(news)