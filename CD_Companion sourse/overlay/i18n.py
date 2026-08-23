# -*- coding: utf-8 -*-
"""
Subsistema de internacionalização (I18n) do CD Companion.

Carrega arquivos JSON de locale a partir de dois caminhos:
  - Externo: ao lado do exe (gravável pelo usuário/comunidade)
  - Interno: embutido no exe (overlay/locales/, somente-leitura em runtime)

Uso básico:
    import overlay.i18n as i18n

    i18n.init(app_dir, language)
    label = i18n.t('settings.language_label')
    # ou, após init(), usar a função global:
    from overlay.i18n import t
    label = t('settings.language_label')
"""

import json
import logging
import os

logger = logging.getLogger('cd_server')


class I18nSystem:
    """Loader e resolvedor de traduções baseado em arquivos JSON de locale."""

    def __init__(self):
        self._app_dir: str = ''
        self._internal_dir: str = ''
        self._external_dir: str = ''
        self._fallback: dict = {}
        self._active: dict = {}
        self._active_code: str = 'en'

    # ── Carregamento ──────────────────────────────────────────────────

    def load(self, app_dir: str, language: str) -> None:
        """Carrega fallback (en) e o locale ativo a partir dos dois caminhos.

        Args:
            app_dir: Diretório do exe (CD_APP_DIR). Idempotente.
            language: Código do idioma ativo (ex.: 'pt-BR').
        """
        self._app_dir = app_dir
        self._internal_dir = os.path.join(os.path.dirname(__file__), 'locales')
        self._external_dir = os.path.join(app_dir, 'locales')
        self._active_code = language

        # Carrega fallback (en)
        self._fallback = self._load_code('en') or {}
        if not self._fallback:
            logger.warning("i18n: fallback locale 'en' não encontrado em nenhum caminho")

        # Carrega locale ativo
        if language == 'en':
            self._active = self._fallback
        else:
            loaded = self._load_code(language)
            if loaded is None:
                logger.warning(
                    "i18n: locale '%s' não encontrado; usando fallback 'en'", language
                )
                self._active = self._fallback
                self._active_code = 'en'
            else:
                self._active = loaded

    def set_locale(self, language: str) -> None:
        """Troca o locale ativo em memória sem recarregar o fallback.

        Args:
            language: Código do idioma (ex.: 'pt-BR').
        """
        self._active_code = language
        if language == 'en':
            self._active = self._fallback
            return

        loaded = self._load_code(language)
        if loaded is None:
            logger.warning(
                "i18n: set_locale: locale '%s' não encontrado; mantendo fallback 'en'",
                language,
            )
            self._active = self._fallback
            self._active_code = 'en'
        else:
            self._active = loaded

    # ── Tradução ──────────────────────────────────────────────────────

    def t(self, key: str, *args) -> str:
        """Retorna a string traduzida com placeholders substituídos.

        Ordem de busca: active_locale → fallback → key.
        Chaves com prefixo '_' retornam key diretamente (metadados).

        Args:
            key: Translation_Key no formato 'namespace.chave'.
            *args: Valores para substituir placeholders {0}, {1}, etc.

        Returns:
            String traduzida com placeholders substituídos.
        """
        if key.startswith('_'):
            return key

        value = self._active.get(key) or self._fallback.get(key)
        if value is None:
            return key

        if args:
            for i, arg in enumerate(args):
                value = value.replace('{' + str(i) + '}', str(arg))

        return value

    def get_dict(self) -> dict:
        """Retorna o dicionário mesclado (active sobre fallback), excluindo metadados.

        Returns:
            Dicionário com todas as chaves de tradução (sem prefixo '_').
        """
        merged = {}
        for k, v in self._fallback.items():
            if not k.startswith('_'):
                merged[k] = v
        for k, v in self._active.items():
            if not k.startswith('_'):
                merged[k] = v
        return merged

    def list_available(self) -> list:
        """Escaneia externo depois interno e retorna lista de idiomas disponíveis.

        Externo tem precedência sobre interno para o mesmo código.
        Retorna lista ordenada por _language_name, com unicidade por código.

        Returns:
            Lista de dicts: [{'code': 'en', 'name': 'English'}, ...]
        """
        seen_codes: dict = {}  # code -> {'code': ..., 'name': ...}

        # Escaneia externo primeiro (tem precedência)
        for path, code in self._iter_locale_files(self._external_dir):
            if code in seen_codes:
                continue
            data = self._load_locale_file(path)
            if data is None:
                continue
            name = data.get('_language_name', '')
            if not name:
                logger.warning("i18n: locale '%s' sem _language_name; ignorado", path)
                continue
            seen_codes[code] = {'code': code, 'name': name}

        # Escaneia interno depois (só adiciona se código ainda não visto)
        for path, code in self._iter_locale_files(self._internal_dir):
            if code in seen_codes:
                continue
            data = self._load_locale_file(path)
            if data is None:
                continue
            name = data.get('_language_name', '')
            if not name:
                logger.warning("i18n: locale '%s' sem _language_name; ignorado", path)
                continue
            seen_codes[code] = {'code': code, 'name': name}

        result = sorted(seen_codes.values(), key=lambda x: x['name'])
        return result

    # ── Helpers internos ──────────────────────────────────────────────

    def _load_code(self, code: str) -> dict | None:
        """Carrega um locale pelo código, priorizando externo sobre interno.

        Args:
            code: Código do idioma (ex.: 'en', 'pt-BR').

        Returns:
            Dicionário do locale ou None se não encontrado/inválido.
        """
        # Tenta externo primeiro
        ext_path = os.path.join(self._external_dir, f'{code}.json')
        if os.path.isfile(ext_path):
            data = self._load_locale_file(ext_path)
            if data is not None:
                return data

        # Tenta interno
        int_path = os.path.join(self._internal_dir, f'{code}.json')
        if os.path.isfile(int_path):
            data = self._load_locale_file(int_path)
            if data is not None:
                return data

        return None

    def _iter_locale_files(self, directory: str):
        """Itera sobre arquivos .json em um diretório, retornando (path, code).

        Args:
            directory: Caminho do diretório a escanear.

        Yields:
            Tuplas (path, code) para cada arquivo .json encontrado.
        """
        if not os.path.isdir(directory):
            return
        try:
            entries = os.listdir(directory)
        except OSError as e:
            logger.warning("i18n: erro ao listar diretório '%s': %s", directory, e)
            return

        for filename in entries:
            if not filename.endswith('.json'):
                continue
            code = filename[:-5]  # remove '.json'
            path = os.path.join(directory, filename)
            yield path, code

    def _load_locale_file(self, path: str) -> dict | None:
        """Carrega e valida um arquivo JSON de locale.

        Retorna None se:
        - Arquivo não existe ou não pode ser lido
        - JSON inválido
        - Não é um objeto (dict)
        - Algum valor não é string

        Chaves com prefixo '_' são aceitas (metadados).

        Args:
            path: Caminho completo do arquivo JSON.

        Returns:
            Dicionário do locale ou None se inválido.
        """
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("i18n: arquivo de locale inválido '%s': %s", path, e)
            return None

        if not isinstance(data, dict):
            logger.warning(
                "i18n: arquivo de locale '%s' não é um objeto JSON; ignorado", path
            )
            return None

        for key, value in data.items():
            if not isinstance(value, str):
                logger.warning(
                    "i18n: arquivo de locale '%s' contém valor não-string na chave '%s'; ignorado",
                    path,
                    key,
                )
                return None

        return data


# ── Instância global e funções de conveniência ────────────────────────

_instance: I18nSystem | None = None


def init(app_dir: str, language: str) -> None:
    """Inicializa a instância global do I18nSystem.

    Args:
        app_dir: Diretório do exe (CD_APP_DIR).
        language: Código do idioma ativo (ex.: 'en', 'pt-BR').
    """
    global _instance
    _instance = I18nSystem()
    _instance.load(app_dir, language)


def t(key: str, *args) -> str:
    """Função de conveniência global. Passthrough seguro se não inicializado.

    Args:
        key: Translation_Key no formato 'namespace.chave'.
        *args: Valores para substituir placeholders {0}, {1}, etc.

    Returns:
        String traduzida, ou a própria key se não inicializado.
    """
    if _instance is None:
        return key
    return _instance.t(key, *args)
