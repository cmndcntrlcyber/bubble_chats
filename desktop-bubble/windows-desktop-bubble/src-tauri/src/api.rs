use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const ANTHROPIC_API: &str = "https://api.anthropic.com/v1/messages";
const TAVILY_API: &str    = "https://api.tavily.com/search";

const SYSTEM_PROMPT: &str =
    "You are a helpful desktop assistant powered by Claude. \
     Be concise and practical. When analyzing screenshots, identify issues \
     clearly and suggest specific fixes. Use plain text — no markdown headers.";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentBlock {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<ImageSource>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub kind: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub role: String,
    pub content: Vec<ContentBlock>,
}

/// Send messages to Claude and return the full response text.
/// Optionally enriches the system prompt with Tavily search results.
#[tauri::command]
pub async fn send_message(
    messages: Vec<Message>,
    model: String,
    api_key: String,
    tavily_key: Option<String>,
) -> Result<String, String> {
    let client = Client::new();

    // Build system prompt — optionally prepend Tavily context
    let mut system = SYSTEM_PROMPT.to_string();
    if let Some(ref tkey) = tavily_key {
        if !tkey.is_empty() {
            // Extract text from last user message for the search query
            let query = messages
                .iter()
                .rev()
                .find(|m| m.role == "user")
                .and_then(|m| m.content.iter().find(|b| b.kind == "text"))
                .and_then(|b| b.text.clone())
                .unwrap_or_default();

            if !query.is_empty() {
                let ctx = tavily_search_inner(&client, &query, tkey).await.unwrap_or_default();
                if !ctx.is_empty() {
                    system.push_str("\n\nWeb search context:\n");
                    system.push_str(&ctx);
                }
            }
        }
    }

    let body = json!({
        "model": model,
        "max_tokens": 1024,
        "system": system,
        "messages": messages,
    });

    let resp = client
        .post(ANTHROPIC_API)
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let err: Value = resp.json().await.unwrap_or_default();
        return Err(err["error"]["message"]
            .as_str()
            .unwrap_or("request failed")
            .to_string());
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let text = data["content"]
        .as_array()
        .and_then(|arr| arr.iter().find(|b| b["type"] == "text"))
        .and_then(|b| b["text"].as_str())
        .unwrap_or("")
        .to_string();

    Ok(text)
}

// ── Ollama ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

fn to_ollama_messages(messages: &[Message], system_prompt: &str) -> Vec<OllamaMessage> {
    let mut result = vec![OllamaMessage {
        role: "system".into(),
        content: system_prompt.to_string(),
        images: None,
    }];
    for m in messages {
        let text: String = m.content.iter()
            .filter(|b| b.kind == "text")
            .filter_map(|b| b.text.as_deref())
            .collect::<Vec<_>>()
            .join("");
        let images: Vec<String> = m.content.iter()
            .filter(|b| b.kind == "image")
            .filter_map(|b| b.source.as_ref().map(|s| s.data.clone()))
            .collect();
        result.push(OllamaMessage {
            role: m.role.clone(),
            content: text,
            images: if images.is_empty() { None } else { Some(images) },
        });
    }
    result
}

/// Send messages to a local Ollama instance and return the full response.
#[tauri::command]
pub async fn send_message_ollama(
    messages: Vec<Message>,
    model: String,
    host: String,
    tavily_key: Option<String>,
) -> Result<String, String> {
    let client = Client::new();

    // Optionally enrich system prompt with Tavily context
    let mut system = SYSTEM_PROMPT.to_string();
    if let Some(ref tkey) = tavily_key {
        if !tkey.is_empty() {
            let query = messages.iter().rev()
                .find(|m| m.role == "user")
                .and_then(|m| m.content.iter().find(|b| b.kind == "text"))
                .and_then(|b| b.text.clone())
                .unwrap_or_default();
            if !query.is_empty() {
                let ctx = tavily_search_inner(&client, &query, tkey).await.unwrap_or_default();
                if !ctx.is_empty() {
                    system.push_str("\n\nWeb search context:\n");
                    system.push_str(&ctx);
                }
            }
        }
    }

    let ollama_messages = to_ollama_messages(&messages, &system);
    let base = host.trim_end_matches('/');
    let body = json!({ "model": model, "messages": ollama_messages, "stream": false });

    let resp = client
        .post(format!("{base}/api/chat"))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Ollama error: {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["message"]["content"].as_str().unwrap_or("").to_string())
}

/// List models available on a local Ollama instance.
#[tauri::command]
pub async fn fetch_ollama_models(host: String) -> Result<Vec<String>, String> {
    let client = Client::new();
    let base = host.trim_end_matches('/');
    let resp = client
        .get(format!("{base}/api/tags"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Ollama error: {}", resp.status()));
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let names = data["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Ok(names)
}

/// Public Tauri command wrapper for Tavily search.
#[tauri::command]
pub async fn tavily_search(query: String, api_key: String) -> Result<String, String> {
    let client = Client::new();
    tavily_search_inner(&client, &query, &api_key).await
}

async fn tavily_search_inner(
    client: &Client,
    query: &str,
    api_key: &str,
) -> Result<String, String> {
    let body = json!({
        "api_key": api_key,
        "query": query,
        "max_results": 3,
    });

    let resp = client
        .post(TAVILY_API)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(String::new());
    }

    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let results = data["results"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    let title = r["title"].as_str()?;
                    let content = r["content"].as_str()?;
                    Some(format!("{title}: {content}"))
                })
                .collect::<Vec<_>>()
                .join("\n\n")
        })
        .unwrap_or_default();

    Ok(results)
}
