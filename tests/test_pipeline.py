import asyncio
import json
import httpx
import websockets

async def monitor_debate():
    uri = "ws://localhost:8000/ws/trading-floor"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket. Triggering event...")
            
            # Trigger the pipeline
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:8000/api/trigger-event",
                    json={"event": "Transport Strike in Gujarat", "simulate_hallucination": True}
                )
                print(f"API Triggered: {response.status_code}")
            
            with open("testing.txt", "w", encoding="utf-8") as f:
                f.write("=== FILLADO DEBATE PIPELINE MONITOR ===\n")
                f.write("Event: Transport Strike in Gujarat\n\n")

            print("Listening for stream...")
            
            while True:
                message = await websocket.recv()
                data = json.loads(message)
                
                with open("testing.txt", "a", encoding="utf-8") as f:
                    if data["type"] == "debate_start":
                        msg = f"\n[DEBATE INITIATED] Topic: {data['topic']}\n"
                        print(msg, end="")
                        f.write(msg)
                    
                    elif data["type"] == "speaker_change":
                        msg = f"\n\n>>> Active Speaker: {data['speaker'].upper()} <<<\n"
                        print(msg, end="")
                        f.write(msg)
                    
                    elif data["type"] == "token":
                        chunk = data["content"]
                        print(chunk, end="", flush=True)
                        f.write(chunk)
                        
                    elif data["type"] == "hallucination_detected":
                        msg = f"\n\n[🚨 THOUGHT POLICEMAN INTERCEPT: Hallucination detected for {data['speaker']}]"
                        print(msg, end="")
                        f.write(msg)
                        
                    elif data["type"] == "mcp_tool":
                        msg = f"\n[🔌 MCP TOOL EXECUTION] {data['tool']} -> grounded knowledge injected."
                        print(msg, end="")
                        f.write(msg)
                    
                    elif data["type"] == "synthesis_complete":
                        msg = f"\n\n=== DEBATE COMPLETE ===\nFinal Signal: {json.dumps(data['signal'], indent=2)}\n"
                        print(msg, end="")
                        f.write(msg)
                        break

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(monitor_debate())
