"""Gera certificado autoassinado para WSS em 10.0.0.9 (usa cryptography, sem openssl CLI)"""
import datetime, ipaddress, os
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

IP = '10.0.0.9'
_script_dir = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(_script_dir, '..', 'certs')
os.makedirs(out, exist_ok=True)
key_path  = os.path.join(out, 'server.key')
cert_path = os.path.join(out, 'server.crt')

# Gera chave privada
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

# Gera certificado autoassinado
subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, IP)])
cert = (
    x509.CertificateBuilder()
    .subject_name(subject)
    .issuer_name(subject)
    .public_key(key.public_key())
    .serial_number(x509.random_serial_number())
    .not_valid_before(datetime.datetime.utcnow())
    .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
    .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address(IP))]), critical=False)
    .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
    .sign(key, hashes.SHA256())
)

with open(key_path, 'wb') as f:
    f.write(key.private_bytes(serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()))

with open(cert_path, 'wb') as f:
    f.write(cert.public_bytes(serialization.Encoding.PEM))

print(f'Gerado:\n  {cert_path}\n  {key_path}')
print('\nPróximo passo: transfira server.crt para o celular e importe no Firefox Android:')
print('  Configurações → Privacidade e Segurança → Certificados → Importar')
