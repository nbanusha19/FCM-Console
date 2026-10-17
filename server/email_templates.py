from __future__ import annotations

import html


def branded_email_html(
    module: str,
    title: str,
    content_html: str,
    *,
    preheader: str = "",
    accent: str = "#155eef",
) -> str:
    safe_module = html.escape(module, quote=True)
    safe_title = html.escape(title, quote=True)
    safe_preheader = html.escape(preheader, quote=True)
    return (
        "<!doctype html><html><body style=\"margin:0;padding:0;background-color:#f3f6fb;"
        "font-family:Arial,Helvetica,sans-serif;color:#172b4d\">"
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0">{safe_preheader}</div>'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" '
        'border="0" style="background-color:#f3f6fb"><tr><td align="center" '
        'style="padding:24px 12px">'
        '<table role="presentation" width="600" cellspacing="0" cellpadding="0" '
        'border="0" style="width:100%;max-width:600px;background-color:#ffffff;'
        'border:1px solid #dce3ed;border-radius:12px;overflow:hidden">'
        f'<tr><td style="padding:18px 24px;background-color:{accent};color:#ffffff">'
        '<div style="font-size:12px;font-weight:bold;letter-spacing:1.4px;'
        'text-transform:uppercase">FCM Console</div>'
        f'<div style="padding-top:5px;font-size:12px;color:#e8efff">{safe_module}</div>'
        '</td></tr><tr><td style="padding:28px 24px">'
        f'<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#172b4d">{safe_title}</h1>'
        f'<div style="font-size:15px;line-height:1.65;color:#344563">{content_html}</div>'
        '</td></tr></table></td></tr></table></body></html>'
    )


def plain_text_to_html(text: str) -> str:
    paragraphs = [
        "<br>".join(html.escape(line, quote=True) for line in paragraph.splitlines())
        for paragraph in text.strip().split("\n\n")
    ]
    return "".join(
        f'<p style="margin:0 0 16px">{paragraph}</p>'
        for paragraph in paragraphs
        if paragraph
    )


def otp_email_html(
    module: str,
    title: str,
    intro: str,
    code: str,
    instructions: str,
    *,
    preheader: str = "",
) -> str:
    content = (
        f'<p style="margin:0 0 16px">{html.escape(intro, quote=True)}</p>'
        f'<div style="margin:20px 0;padding:18px;text-align:center;background-color:#f3f6fb;'
        'border:1px solid #dce3ed;border-radius:8px">'
        '<span style="font-size:28px;font-weight:bold;letter-spacing:8px;'
        f'color:#155eef">{html.escape(code, quote=True)}</span></div>'
        f'<p style="margin:0">{html.escape(instructions, quote=True)}</p>'
    )
    return branded_email_html(
        module,
        title,
        content,
        preheader=preheader,
    )
