"""Permite rodar com: python -m server"""
from server.main import _main
import asyncio

if __name__ == "__main__":
    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        import logging
        logging.getLogger('cd_server').info("Shutting down")
