"""Script auxiliar para extrair o INJECT_JS do overlay_app.py para um arquivo .js separado.
Converte as chaves duplas do f-string ({{ }}) de volta para chaves simples ({ }).
Substitui a interpolação '{WS_URL}' por '${WS_URL}' para uso com string.Template.
"""
import re
import sys
import os

src = os.path.join(os.path.dirname(__file__), '..', 'overlay_app.py')
dst = os.path.join(os.path.dirname(__file__), '..', 'overlay_inject.js')

with open(src, 'r', encoding='utf-8') as f:
    content = f.read()

# Encontra o bloco INJECT_JS = f"""..."""
match = re.search(r'INJECT_JS\s*=\s*f"""(.*?)"""', content, re.DOTALL)
if not match:
    print("INJECT_JS not found!")
    sys.exit(1)

js = match.group(1)

# Desfaz o escaping do f-string: {{ → { e }} → }
js = js.replace('{{', '{').replace('}}', '}')

# Substitui a interpolação Python '{WS_URL}' por placeholder Template
# No f-string original era: const WS_URL = '{WS_URL}';
# Que após desfazer {{ }} vira: const WS_URL = '{WS_URL}';
# Precisamos trocar para: const WS_URL = '$WS_URL';
js = js.replace("'{WS_URL}'", "'$WS_URL'")

with open(dst, 'w', encoding='utf-8') as f:
    f.write(js)

print(f"Extraído: {dst} ({len(js)} chars)")
