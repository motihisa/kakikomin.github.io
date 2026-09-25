// =========================
// KAKIKOMI 基本処理
// =========================

const postForm = document.getElementById("post-form");
const postList = document.getElementById("post-list");

const categoryInput = document.getElementById("category");
const contentInput = document.getElementById("content");
const imageInput = document.getElementById("image");
const imagePreview = document.getElementById("image-preview");


// =========================
// 画像プレビュー
// =========================

imageInput.addEventListener("change", () => {

  imagePreview.innerHTML = "";

  const file = imageInput.files[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    imageInput.value = "";
    return;
  }

  const image = document.createElement("img");

  image.src = URL.createObjectURL(file);

  imagePreview.appendChild(image);
});


// =========================
// 投稿
// =========================

postForm.addEventListener("submit", (event) => {

  event.preventDefault();

  const category = categoryInput.value;
  const content = contentInput.value.trim();

  if (!category) {
    alert("カテゴリーを選択してください。");
    return;
  }

  if (!content) {
    alert("内容を入力してください。");
    return;
  }


  // 投稿を作成
  const post = document.createElement("article");

  post.className = "post";


  // 現在の日付
  const now = new Date();

  const date =
    now.getFullYear() +
    "/" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "/" +
    String(now.getDate()).padStart(2, "0");


  // 投稿内容
  post.innerHTML = `
    <div class="post-header">
      <span class="post-category">${escapeHTML(category)}</span>
      <span class="post-date">${date}</span>
    </div>

    <p class="post-content">${escapeHTML(content)}</p>

    <div class="post-actions">
      <button type="button" class="like-button">
        👍 0
      </button>

      <button type="button" class="reply-button">
        返信
      </button>
    </div>
  `;


  // 画像があれば追加
  const file = imageInput.files[0];

  if (file) {

    const image = document.createElement("img");

    image.src = URL.createObjectURL(file);

    image.style.maxWidth = "100%";
    image.style.maxHeight = "400px";
    image.style.marginTop = "10px";
    image.style.borderRadius = "8px";

    post.insertBefore(
      image,
      post.querySelector(".post-actions")
    );
  }


  // 一番上に追加
  postList.prepend(post);


  // フォームをリセット
  postForm.reset();

  imagePreview.innerHTML = "";


  alert("投稿しました！");
});


// =========================
// いいね
// =========================

postList.addEventListener("click", (event) => {

  if (!event.target.classList.contains("like-button")) {
    return;
  }

  const button = event.target;

  let count = Number(
    button.textContent.replace("👍", "").trim()
  );

  count++;

  button.textContent = `👍 ${count}`;
});


// =========================
// HTMLとして解釈されないようにする
// =========================

function escapeHTML(text) {

  const div = document.createElement("div");

  div.textContent = text;

  return div.innerHTML;
}
