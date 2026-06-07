#!/usr/bin/env python
"""
Send a test transaction to the FraudSentinel agent server.

Usage:
  python scripts/send_test_transaction.py --scenario fraud
  python scripts/send_test_transaction.py --scenario clean
  python scripts/send_test_transaction.py --scenario drift --repeat 20
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
import click
import httpx
import json
from rich.console import Console
from rich.table import Table
from data.mock_transactions import make_transaction, SCENARIOS

console = Console()
BASE_URL = "http://localhost:8000"


@click.command()
@click.option("--scenario", default="fraud",
              type=click.Choice(list(SCENARIOS.keys())),
              help="Which demo scenario to run")
@click.option("--repeat", default=1, help="Send N transactions (useful for drift simulation)")
@click.option("--url", default=BASE_URL, help="Agent server URL")
def main(scenario: str, repeat: int, url: str):
    asyncio.run(_run(scenario, repeat, url))


async def _run(scenario: str, repeat: int, url: str):
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Check health first
        try:
            health = await client.get(f"{url}/health")
            demo_mode = health.json().get("demo_mode", True)
            console.print(f"[green]✓ Agent server online[/green] [dim](demo_mode={demo_mode})[/dim]")
        except Exception:
            console.print(f"[red]✗ Cannot reach agent server at {url}[/red]")
            console.print("  Start it with: [bold]python -m agent.orchestrator[/bold]")
            return

        for i in range(repeat):
            tx = make_transaction(scenario)
            if repeat > 1:
                console.print(f"\n[dim]Transaction {i+1}/{repeat}[/dim]")

            console.print(f"\n[bold]Sending[/bold] scenario=[cyan]{scenario}[/cyan] "
                         f"id=[dim]{tx.transaction_id}[/dim] "
                         f"amount=[yellow]${tx.amount:,.2f}[/yellow]")

            try:
                resp = await client.post(
                    f"{url}/investigate",
                    json=tx.model_dump(mode="json"),
                )
                resp.raise_for_status()
                result = resp.json()
                _print_result(result)
            except httpx.HTTPStatusError as e:
                console.print(f"[red]HTTP error: {e.response.status_code}[/red]")
                console.print(e.response.text)

            if repeat > 1 and i < repeat - 1:
                await asyncio.sleep(0.3)


def _print_result(r: dict):
    decision = r["decision"]
    color = {"ALLOW": "green", "FLAG": "yellow", "BLOCK": "red"}.get(decision, "white")

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column("key",   style="dim", width=20)
    table.add_column("value", style="bold")

    table.add_row("Decision",     f"[{color}]{decision}[/{color}]")
    table.add_row("Risk score",   f"{r['risk_score']:.4f}")
    table.add_row("Processing",   f"{r['processing_ms']}ms")
    table.add_row("Violations",   str(len(r.get("rule_violations", []))))
    table.add_row("Trace ID",     r.get("trace_id", "—")[:16] + "…")

    console.print(table)
    console.print(f"\n[bold]Reasoning:[/bold] {r['reasoning']}\n")

    if r.get("sar_draft"):
        console.print("[bold]SAR Draft:[/bold]")
        console.print(f"[dim]{r['sar_draft'][:400]}…[/dim]")


if __name__ == "__main__":
    main()
