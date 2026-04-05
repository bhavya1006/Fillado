# scripts/test_neo4j_connection.py
# Run with: python -m scripts.test_neo4j_connection

import asyncio
import socket
import time
from backend.core.config import get_settings

def test_dns_resolution(host: str, port: int):
    print(f"\n[DNS] Resolving {host}:{port}...")
    try:
        start = time.time()
        results = socket.getaddrinfo(host, port, socket.AF_UNSPEC, socket.SOCK_STREAM)
        elapsed = (time.time() - start) * 1000
        print(f"[DNS] ✅ Resolved in {elapsed:.0f}ms → {results[0][4]}")
        return True
    except socket.gaierror as e:
        print(f"[DNS] ❌ DNS resolution failed: {e}")
        return False

def test_tcp_connect(host: str, port: int, timeout: int = 10):
    print(f"\n[TCP] Connecting to {host}:{port} (timeout={timeout}s)...")
    try:
        start = time.time()
        sock = socket.create_connection((host, port), timeout=timeout)
        elapsed = (time.time() - start) * 1000
        sock.close()
        print(f"[TCP] ✅ TCP connected in {elapsed:.0f}ms")
        return True
    except socket.timeout:
        print(f"[TCP] ❌ Connection timed out after {timeout}s")
        return False
    except ConnectionRefusedError:
        print(f"[TCP] ❌ Connection refused — port {port} not open")
        return False
    except Exception as e:
        print(f"[TCP] ❌ Connection failed: {e}")
        return False

def test_neo4j_driver(uri: str, username: str, password: str):
    print(f"\n[NEO4J] Testing driver connection to {uri}...")
    try:
        from neo4j import GraphDatabase
        start = time.time()
        driver = GraphDatabase.driver(uri, auth=(username, password),
                                       connection_timeout=15)
        driver.verify_connectivity()
        elapsed = (time.time() - start) * 1000
        print(f"[NEO4J] ✅ Driver connected in {elapsed:.0f}ms")
        return driver
    except Exception as e:
        print(f"[NEO4J] ❌ Driver failed: {type(e).__name__}: {e}")
        return None

def test_write(driver):
    print(f"\n[WRITE] Testing Cypher MERGE write...")
    try:
        with driver.session() as session:
            result = session.run("""
                MERGE (s:Entity {name: $source})
                MERGE (t:Entity {name: $target})
                MERGE (s)-[r:CAUSAL_LINK {type: $rel}]->(t)
                ON CREATE SET r.created_at = datetime(), r.tier = $tier,
                              r.confidence = $confidence, r.updated_at = datetime()
                ON MATCH SET  r.updated_at = datetime(),
                              r.confidence = CASE WHEN $confidence > r.confidence
                                             THEN $confidence ELSE r.confidence END
                RETURN s.name AS src, t.name AS tgt, type(r) AS rel
            """, source="TEST_SOURCE", target="TEST_TARGET",
                 rel="IMPACTS", tier=1, confidence=0.99)
            record = result.single()
            print(f"[WRITE] ✅ Written: {record['src']} -[{record['rel']}]→ {record['tgt']}")
            return True
    except Exception as e:
        print(f"[WRITE] ❌ Write failed: {type(e).__name__}: {e}")
        return False

def test_read(driver):
    print(f"\n[READ] Testing Cypher READ...")
    try:
        with driver.session() as session:
            result = session.run("MATCH (n:Entity) RETURN n.name AS name LIMIT 5")
            records = [r["name"] for r in result]
            print(f"[READ] ✅ Found {len(records)} Entity nodes: {records}")
            return True
    except Exception as e:
        print(f"[READ] ❌ Read failed: {type(e).__name__}: {e}")
        return False

def cleanup(driver):
    print(f"\n[CLEANUP] Removing test nodes...")
    try:
        with driver.session() as session:
            session.run("""
                MATCH (s:Entity {name: 'TEST_SOURCE'})
                MATCH (t:Entity {name: 'TEST_TARGET'})
                DETACH DELETE s, t
            """)
        print("[CLEANUP] ✅ Test nodes removed")
    except Exception as e:
        print(f"[CLEANUP] ⚠️ Cleanup failed: {e}")

if __name__ == "__main__":
    settings = get_settings()
    
    print("=" * 60)
    print("NEO4J CONNECTION DIAGNOSTIC")
    print("=" * 60)
    print(f"URI:      {settings.neo4j_uri}")
    print(f"Username: {settings.neo4j_username}")
    print(f"Password: {'*' * len(settings.neo4j_password or '')}")

    # Parse host and port from URI
    # bolt+s://abc123.databases.neo4j.io:7687
    try:
        from urllib.parse import urlparse
        parsed = urlparse(settings.neo4j_uri)
        host = parsed.hostname
        port = parsed.port or 7687
    except Exception as e:
        print(f"\n❌ Could not parse URI: {e}")
        exit(1)

    print(f"\nParsed host: {host}")
    print(f"Parsed port: {port}")

    dns_ok  = test_dns_resolution(host, port)
    tcp_ok  = test_tcp_connect(host, port) if dns_ok else False
    driver  = test_neo4j_driver(settings.neo4j_uri, settings.neo4j_username,
                                 settings.neo4j_password) if tcp_ok else None
    
    if driver:
        write_ok = test_write(driver)
        read_ok  = test_read(driver) if write_ok else False
        cleanup(driver)
        driver.close()

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  DNS resolution:    {'✅' if dns_ok  else '❌'}")
    print(f"  TCP connection:    {'✅' if tcp_ok  else '❌ (check firewall/VPN)'}")
    print(f"  Neo4j driver:      {'✅' if driver  else '❌ (check credentials)'}")
    print(f"  Write (MERGE):     {'✅' if driver and write_ok else '❌'}")
    print(f"  Read (MATCH):      {'✅' if driver and read_ok  else '❌'}")
    
    if not dns_ok:
        print("\n💡 DNS failing means your machine cannot resolve the Neo4j AuraDB hostname.")
        print("   Try: ping " + (host or "your-neo4j-host"))
        print("   Fix options:")
        print("   1. Check your internet connection")
        print("   2. Try on a different network (corporate firewall may block port 7687)")
        print("   3. Use a VPN if your AuraDB instance is region-locked")
        print("   4. Verify the URI in your .env matches your AuraDB console exactly")