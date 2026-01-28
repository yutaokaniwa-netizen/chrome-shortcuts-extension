// ショートカット管理クラス
class ShortcutManager {
  constructor() {
    this.shortcuts = [];
    this.groups = [];
    this.editingId = null;
    this.editingGroupId = null;
    this.contextTarget = null;
    this.contextType = null; // 'shortcut' or 'group'
    this.draggedItem = null;
    this.draggedIndex = null;
    this.draggedGroupId = null;
    // グループドラッグ用
    this.draggedGroupSection = null;
    this.draggedGroupIndex = null;
    
    this.defaultGroups = [
      { id: 'default', name: '未分類', color: '#666666' }
    ];
    
    this.groupColors = [
      '#4285f4', '#ea4335', '#fbbc04', '#34a853', '#ff6d01',
      '#46bdc6', '#7baaf7', '#f07b72', '#fcd04f', '#57bb8a',
      '#a142f4', '#ff63b8', '#4ecde6', '#9aa0a6', '#80868b'
    ];
    
    this.init();
  }
  
  async init() {
    await this.loadData();
    this.setupClock();
    this.setupEventListeners();
    this.render();
  }
  
  // ストレージからデータを読み込み
  async loadData() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['shortcuts', 'groups'], (result) => {
          this.shortcuts = result.shortcuts || [];
          this.groups = result.groups || [...this.defaultGroups];
          this.migrateData();
          resolve();
        });
      } else {
        // 開発用：ローカルストレージを使用
        const savedShortcuts = localStorage.getItem('shortcuts');
        const savedGroups = localStorage.getItem('groups');
        this.shortcuts = savedShortcuts ? JSON.parse(savedShortcuts) : [];
        this.groups = savedGroups ? JSON.parse(savedGroups) : [...this.defaultGroups];
        this.migrateData();
        resolve();
      }
    });
  }
  
  // 既存データのマイグレーション（groupIdがないショートカットに追加）
  migrateData() {
    let needsSave = false;
    
    // グループがない場合はデフォルトグループを追加
    if (this.groups.length === 0) {
      this.groups = [...this.defaultGroups];
      needsSave = true;
    }
    
    // デフォルトグループが存在するか確認
    if (!this.groups.find(g => g.id === 'default')) {
      this.groups.unshift({ id: 'default', name: '未分類', color: '#666666' });
      needsSave = true;
    }
    
    // ショートカットにgroupIdがない場合は'default'を設定
    this.shortcuts.forEach(shortcut => {
      if (!shortcut.groupId) {
        shortcut.groupId = 'default';
        needsSave = true;
      }
    });
    
    if (needsSave) {
      this.saveData();
    }
  }
  
  // データを保存
  async saveData() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ 
          shortcuts: this.shortcuts,
          groups: this.groups 
        }, resolve);
      } else {
        localStorage.setItem('shortcuts', JSON.stringify(this.shortcuts));
        localStorage.setItem('groups', JSON.stringify(this.groups));
        resolve();
      }
    });
  }
  
  // 時計のセットアップ
  setupClock() {
    const updateClock = () => {
      const now = new Date();
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('clock').textContent = `${hours}:${minutes}`;
      
      const options = { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        weekday: 'long' 
      };
      document.getElementById('date').textContent = now.toLocaleDateString('ja-JP', options);
    };
    
    updateClock();
    setInterval(updateClock, 1000);
  }
  
  // イベントリスナーのセットアップ
  setupEventListeners() {
    // ショートカット追加ボタン
    document.getElementById('add-shortcut-btn').addEventListener('click', () => {
      this.openShortcutModal();
    });
    
    // グループ追加ボタン
    document.getElementById('add-group-btn').addEventListener('click', () => {
      this.openGroupModal();
    });
    
    // ショートカットモーダル
    document.getElementById('shortcut-modal-close').addEventListener('click', () => {
      this.closeShortcutModal();
    });
    document.getElementById('shortcut-modal-cancel').addEventListener('click', () => {
      this.closeShortcutModal();
    });
    document.getElementById('shortcut-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'shortcut-modal-overlay') {
        this.closeShortcutModal();
      }
    });
    document.getElementById('shortcut-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveShortcut();
    });
    
    // グループモーダル
    document.getElementById('group-modal-close').addEventListener('click', () => {
      this.closeGroupModal();
    });
    document.getElementById('group-modal-cancel').addEventListener('click', () => {
      this.closeGroupModal();
    });
    document.getElementById('group-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'group-modal-overlay') {
        this.closeGroupModal();
      }
    });
    document.getElementById('group-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveGroup();
    });
    
    // コンテキストメニュー
    document.getElementById('context-edit').addEventListener('click', () => {
      if (this.contextType === 'shortcut' && this.contextTarget !== null) {
        this.openShortcutModal(this.contextTarget);
      } else if (this.contextType === 'group' && this.contextTarget !== null) {
        this.openGroupModal(this.contextTarget);
      }
      this.closeContextMenu();
    });
    
    document.getElementById('context-delete').addEventListener('click', () => {
      if (this.contextType === 'shortcut' && this.contextTarget !== null) {
        this.deleteShortcut(this.contextTarget);
      } else if (this.contextType === 'group' && this.contextTarget !== null) {
        this.deleteGroup(this.contextTarget);
      }
      this.closeContextMenu();
    });
    
    // クリックでコンテキストメニューを閉じる
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.context-menu')) {
        this.closeContextMenu();
      }
    });
    
    // Escキー
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeShortcutModal();
        this.closeGroupModal();
        this.closeContextMenu();
      }
    });
  }
  
  // メイン描画
  render() {
    const container = document.getElementById('shortcuts-container');
    const countEl = document.getElementById('shortcuts-count');
    
    countEl.textContent = `${this.shortcuts.length} 個のショートカット / ${this.groups.length} グループ`;
    
    if (this.shortcuts.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1"></rect>
          </svg>
          <p>ショートカットがありません</p>
          <span>右上の + ボタンからショートカットを追加できます</span>
        </div>
      `;
      return;
    }
    
    // グループごとにショートカットを表示
    let html = '';
    
    this.groups.forEach((group, groupIndex) => {
      const groupShortcuts = this.shortcuts.filter(s => s.groupId === group.id);
      
      // 空のグループでも表示（未分類以外）
      if (groupShortcuts.length === 0 && group.id === 'default') {
        return;
      }
      
      html += `
        <div class="group-section" data-group-id="${group.id}" data-group-index="${groupIndex}" draggable="${group.id !== 'default'}">
          <div class="group-header" style="--group-color: ${group.color}">
            ${group.id !== 'default' ? `
              <div class="group-drag-handle" title="ドラッグして並び替え">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="8" y1="6" x2="16" y2="6"></line>
                  <line x1="8" y1="12" x2="16" y2="12"></line>
                  <line x1="8" y1="18" x2="16" y2="18"></line>
                </svg>
              </div>
            ` : ''}
            <div class="group-title">
              <span class="group-color-dot" style="background: ${group.color}"></span>
              <span class="group-name">${this.escapeHtml(group.name)}</span>
              <span class="group-count">${groupShortcuts.length}</span>
            </div>
            ${group.id !== 'default' ? `
              <button class="group-menu-btn" data-group-index="${groupIndex}">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="12" cy="5" r="1"></circle>
                  <circle cx="12" cy="19" r="1"></circle>
                </svg>
              </button>
            ` : ''}
          </div>
          <div class="shortcuts-grid" data-group-id="${group.id}">
            ${groupShortcuts.map((shortcut) => {
              const index = this.shortcuts.indexOf(shortcut);
              return `
                <a href="${this.escapeHtml(shortcut.url)}" 
                   class="shortcut-item" 
                   data-index="${index}"
                   data-group-id="${group.id}"
                   draggable="true">
                  <div class="shortcut-icon">
                    ${this.getIconHtml(shortcut)}
                  </div>
                  <span class="shortcut-name">${this.escapeHtml(shortcut.name)}</span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });
    
    // 未分類のショートカットがある場合は最後に表示
    const defaultGroup = this.groups.find(g => g.id === 'default');
    const defaultShortcuts = this.shortcuts.filter(s => s.groupId === 'default');
    
    if (defaultShortcuts.length > 0 && defaultGroup) {
      const groupIndex = this.groups.indexOf(defaultGroup);
      html += `
        <div class="group-section" data-group-id="default" data-group-index="${groupIndex}">
          <div class="group-header" style="--group-color: ${defaultGroup.color}">
            <div class="group-title">
              <span class="group-color-dot" style="background: ${defaultGroup.color}"></span>
              <span class="group-name">${this.escapeHtml(defaultGroup.name)}</span>
              <span class="group-count">${defaultShortcuts.length}</span>
            </div>
          </div>
          <div class="shortcuts-grid" data-group-id="default">
            ${defaultShortcuts.map((shortcut) => {
              const index = this.shortcuts.indexOf(shortcut);
              return `
                <a href="${this.escapeHtml(shortcut.url)}" 
                   class="shortcut-item" 
                   data-index="${index}"
                   data-group-id="default"
                   draggable="true">
                  <div class="shortcut-icon">
                    ${this.getIconHtml(shortcut)}
                  </div>
                  <span class="shortcut-name">${this.escapeHtml(shortcut.name)}</span>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
    
    container.innerHTML = html;
    
    // イベントリスナーを設定
    this.setupShortcutEvents();
    this.setupGroupEvents();
  }
  
  // ショートカットのイベント設定
  setupShortcutEvents() {
    document.querySelectorAll('.shortcut-item').forEach((item) => {
      // 右クリック
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const index = parseInt(item.dataset.index);
        this.contextType = 'shortcut';
        this.openContextMenu(e.clientX, e.clientY, index);
      });
      
      // ドラッグ&ドロップ
      item.addEventListener('dragstart', (e) => {
        this.draggedItem = item;
        this.draggedIndex = parseInt(item.dataset.index);
        this.draggedGroupId = item.dataset.groupId;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', ''); // Firefox対応
      });
      
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        document.querySelectorAll('.shortcut-item').forEach(i => i.classList.remove('drag-over'));
        document.querySelectorAll('.shortcuts-grid').forEach(g => g.classList.remove('drag-over'));
        this.draggedItem = null;
        this.draggedIndex = null;
        this.draggedGroupId = null;
      });
      
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this.draggedItem && this.draggedItem !== item) {
          item.classList.add('drag-over');
        }
      });
      
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });
      
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('drag-over');
        
        const targetIndex = parseInt(item.dataset.index);
        const targetGroupId = item.dataset.groupId;
        
        if (this.draggedIndex !== null) {
          this.moveShortcut(this.draggedIndex, targetIndex, targetGroupId);
        }
      });
    });
    
    // グリッドへのドロップ（グループ間移動）
    document.querySelectorAll('.shortcuts-grid').forEach((grid) => {
      grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedItem) {
          grid.classList.add('drag-over');
        }
      });
      
      grid.addEventListener('dragleave', (e) => {
        if (!grid.contains(e.relatedTarget)) {
          grid.classList.remove('drag-over');
        }
      });
      
      grid.addEventListener('drop', (e) => {
        e.preventDefault();
        grid.classList.remove('drag-over');
        
        // ショートカットアイテムへのドロップでなければグループ移動
        if (!e.target.closest('.shortcut-item') && this.draggedIndex !== null) {
          const targetGroupId = grid.dataset.groupId;
          this.moveShortcutToGroup(this.draggedIndex, targetGroupId);
        }
      });
    });
  }
  
  // グループのイベント設定
  setupGroupEvents() {
    document.querySelectorAll('.group-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const groupIndex = parseInt(btn.dataset.groupIndex);
        this.contextType = 'group';
        this.openContextMenu(e.clientX, e.clientY, groupIndex);
      });
    });
    
    // グループのドラッグ&ドロップ
    document.querySelectorAll('.group-section[draggable="true"]').forEach((section) => {
      section.addEventListener('dragstart', (e) => {
        // ショートカットのドラッグでない場合のみ
        if (e.target.classList.contains('shortcut-item')) return;
        
        this.draggedGroupSection = section;
        this.draggedGroupIndex = parseInt(section.dataset.groupIndex);
        section.classList.add('group-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'group');
      });
      
      section.addEventListener('dragend', () => {
        section.classList.remove('group-dragging');
        document.querySelectorAll('.group-section').forEach(s => {
          s.classList.remove('group-drag-over');
        });
        this.draggedGroupSection = null;
        this.draggedGroupIndex = null;
      });
      
      section.addEventListener('dragover', (e) => {
        // グループをドラッグ中の場合のみ
        if (this.draggedGroupSection && this.draggedGroupSection !== section) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          section.classList.add('group-drag-over');
        }
      });
      
      section.addEventListener('dragleave', (e) => {
        if (!section.contains(e.relatedTarget)) {
          section.classList.remove('group-drag-over');
        }
      });
      
      section.addEventListener('drop', (e) => {
        // グループのドロップ処理
        if (this.draggedGroupSection && this.draggedGroupSection !== section) {
          e.preventDefault();
          e.stopPropagation();
          section.classList.remove('group-drag-over');
          
          const targetIndex = parseInt(section.dataset.groupIndex);
          if (this.draggedGroupIndex !== null && this.draggedGroupIndex !== targetIndex) {
            this.moveGroup(this.draggedGroupIndex, targetIndex);
          }
        }
      });
    });
  }
  
  // グループを移動（並べ替え）
  async moveGroup(fromIndex, toIndex) {
    // デフォルトグループは移動不可
    if (this.groups[fromIndex].id === 'default') return;
    
    const [moved] = this.groups.splice(fromIndex, 1);
    this.groups.splice(toIndex, 0, moved);
    
    await this.saveData();
    this.render();
  }
  
  // ショートカットを移動（並べ替え）
  async moveShortcut(fromIndex, toIndex, targetGroupId) {
    const shortcut = this.shortcuts[fromIndex];
    
    // グループが変わる場合
    if (targetGroupId && shortcut.groupId !== targetGroupId) {
      shortcut.groupId = targetGroupId;
    }
    
    // 位置を入れ替え
    if (fromIndex !== toIndex) {
      this.shortcuts.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      this.shortcuts.splice(adjustedIndex, 0, shortcut);
    }
    
    await this.saveData();
    this.render();
  }
  
  // ショートカットをグループに移動
  async moveShortcutToGroup(shortcutIndex, targetGroupId) {
    this.shortcuts[shortcutIndex].groupId = targetGroupId;
    await this.saveData();
    this.render();
  }
  
  // アイコンのHTMLを取得
  getIconHtml(shortcut) {
    const fallbackLetter = shortcut.name.charAt(0).toUpperCase();
    
    // カスタムアイコンがある場合
    if (shortcut.customIcon) {
      return `
        <img src="${this.escapeHtml(shortcut.customIcon)}" 
             alt="" 
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <span class="fallback-icon" style="display:none;">${fallbackLetter}</span>
      `;
    }
    
    // デフォルト: faviconを取得
    try {
      const url = new URL(shortcut.url);
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
      
      return `
        <img src="${faviconUrl}" 
             alt="" 
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <span class="fallback-icon" style="display:none;">${fallbackLetter}</span>
      `;
    } catch {
      return `<span class="fallback-icon">${fallbackLetter}</span>`;
    }
  }
  
  // ショートカットモーダルを開く
  openShortcutModal(editIndex = null) {
    const modal = document.getElementById('shortcut-modal-overlay');
    const title = document.getElementById('shortcut-modal-title');
    const nameInput = document.getElementById('shortcut-name');
    const urlInput = document.getElementById('shortcut-url');
    const groupSelect = document.getElementById('shortcut-group');
    const iconInput = document.getElementById('shortcut-icon');
    const iconPreview = document.getElementById('icon-preview');
    
    this.editingId = editIndex;
    
    // グループ選択肢を更新
    groupSelect.innerHTML = this.groups.map(g => 
      `<option value="${g.id}">${this.escapeHtml(g.name)}</option>`
    ).join('');
    
    // アイコンプレビューをリセット
    this.resetIconPreview();
    
    if (editIndex !== null) {
      const shortcut = this.shortcuts[editIndex];
      title.textContent = 'ショートカットを編集';
      nameInput.value = shortcut.name;
      urlInput.value = shortcut.url;
      groupSelect.value = shortcut.groupId || 'default';
      iconInput.value = shortcut.customIcon || '';
      
      // カスタムアイコンがあればプレビュー表示
      if (shortcut.customIcon) {
        this.updateIconPreview(shortcut.customIcon);
      }
    } else {
      title.textContent = 'ショートカットを追加';
      nameInput.value = '';
      urlInput.value = '';
      groupSelect.value = 'default';
      iconInput.value = '';
    }
    
    // アイコンURL入力時のプレビュー更新
    iconInput.oninput = () => {
      const iconUrl = iconInput.value.trim();
      if (iconUrl) {
        this.updateIconPreview(iconUrl);
      } else {
        this.resetIconPreview();
      }
    };
    
    modal.classList.add('active');
    nameInput.focus();
  }
  
  // アイコンプレビューを更新
  updateIconPreview(iconUrl) {
    const iconPreview = document.getElementById('icon-preview');
    iconPreview.innerHTML = `<img src="${this.escapeHtml(iconUrl)}" alt="" onerror="this.parentElement.innerHTML='<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\' ry=\\'2\\'></rect><line x1=\\'3\\' y1=\\'3\\' x2=\\'21\\' y2=\\'21\\'></line></svg>'">`;
  }
  
  // アイコンプレビューをリセット
  resetIconPreview() {
    const iconPreview = document.getElementById('icon-preview');
    iconPreview.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21,15 16,10 5,21"></polyline>
      </svg>
    `;
  }
  
  // ショートカットモーダルを閉じる
  closeShortcutModal() {
    const modal = document.getElementById('shortcut-modal-overlay');
    modal.classList.remove('active');
    this.editingId = null;
  }
  
  // ショートカットを保存
  async saveShortcut() {
    const nameInput = document.getElementById('shortcut-name');
    const urlInput = document.getElementById('shortcut-url');
    const groupSelect = document.getElementById('shortcut-group');
    const iconInput = document.getElementById('shortcut-icon');
    
    let url = urlInput.value.trim();
    const name = nameInput.value.trim();
    const groupId = groupSelect.value;
    const customIcon = iconInput.value.trim() || null;
    
    if (url && !url.match(/^https?:\/\//i)) {
      url = 'https://' + url;
    }
    
    if (!name || !url) return;
    
    const shortcutData = { name, url, groupId };
    if (customIcon) {
      shortcutData.customIcon = customIcon;
    }
    
    if (this.editingId !== null) {
      this.shortcuts[this.editingId] = shortcutData;
    } else {
      this.shortcuts.push(shortcutData);
    }
    
    await this.saveData();
    this.closeShortcutModal();
    this.render();
  }
  
  // ショートカットを削除
  async deleteShortcut(index) {
    this.shortcuts.splice(index, 1);
    await this.saveData();
    this.render();
  }
  
  // グループモーダルを開く
  openGroupModal(editIndex = null) {
    const modal = document.getElementById('group-modal-overlay');
    const title = document.getElementById('group-modal-title');
    const nameInput = document.getElementById('group-name');
    const colorContainer = document.getElementById('group-color-options');
    
    this.editingGroupId = editIndex;
    
    // カラーオプションを生成
    colorContainer.innerHTML = this.groupColors.map((color, i) => `
      <label class="color-option">
        <input type="radio" name="group-color" value="${color}" ${i === 0 ? 'checked' : ''}>
        <span class="color-dot" style="background: ${color}"></span>
      </label>
    `).join('');
    
    if (editIndex !== null) {
      const group = this.groups[editIndex];
      title.textContent = 'グループを編集';
      nameInput.value = group.name;
      
      // 色を選択
      const colorInput = colorContainer.querySelector(`input[value="${group.color}"]`);
      if (colorInput) {
        colorInput.checked = true;
      }
    } else {
      title.textContent = 'グループを追加';
      nameInput.value = '';
    }
    
    modal.classList.add('active');
    nameInput.focus();
  }
  
  // グループモーダルを閉じる
  closeGroupModal() {
    const modal = document.getElementById('group-modal-overlay');
    modal.classList.remove('active');
    this.editingGroupId = null;
  }
  
  // グループを保存
  async saveGroup() {
    const nameInput = document.getElementById('group-name');
    const colorInput = document.querySelector('input[name="group-color"]:checked');
    
    const name = nameInput.value.trim();
    const color = colorInput ? colorInput.value : this.groupColors[0];
    
    if (!name) return;
    
    if (this.editingGroupId !== null) {
      const group = this.groups[this.editingGroupId];
      group.name = name;
      group.color = color;
    } else {
      const id = 'group_' + Date.now();
      this.groups.push({ id, name, color });
    }
    
    await this.saveData();
    this.closeGroupModal();
    this.render();
  }
  
  // グループを削除
  async deleteGroup(index) {
    const group = this.groups[index];
    
    if (group.id === 'default') {
      alert('未分類グループは削除できません');
      return;
    }
    
    // グループ内のショートカットを未分類に移動
    this.shortcuts.forEach(shortcut => {
      if (shortcut.groupId === group.id) {
        shortcut.groupId = 'default';
      }
    });
    
    this.groups.splice(index, 1);
    await this.saveData();
    this.render();
  }
  
  // コンテキストメニューを開く
  openContextMenu(x, y, index) {
    const menu = document.getElementById('context-menu');
    const deleteBtn = document.getElementById('context-delete');
    
    this.contextTarget = index;
    
    // グループの場合、デフォルトグループは削除不可
    if (this.contextType === 'group' && this.groups[index]?.id === 'default') {
      deleteBtn.style.display = 'none';
    } else {
      deleteBtn.style.display = 'flex';
    }
    
    const menuWidth = 160;
    const menuHeight = 100;
    
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('active');
  }
  
  // コンテキストメニューを閉じる
  closeContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.classList.remove('active');
    this.contextTarget = null;
    this.contextType = null;
  }
  
  // HTMLエスケープ
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  new ShortcutManager();
});
