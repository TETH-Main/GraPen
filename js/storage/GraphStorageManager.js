import { db } from '../firebase-config.js';
import { collection, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.8.0/firebase-firestore.js";

export class GraphStorageManager {
    constructor(storageKey = 'grapen_saved_graphs') {
        this.storageKey = storageKey;
        this.graphList = [];
        this.initializeGraphList();
    }

    async initializeGraphList() {
        const localGraphs = this.loadFromLocal();

        // 各ハッシュに対してFirestoreを確認
        for (const graph of localGraphs) {
            try {
                const result = await this.checkGraphInFirestore(graph.hash);

                if (result.success) {
                    // Firestoreにデータがある場合、ローカルの詳細データを削除
                    const cleanedGraph = { hash: graph.hash };
                    this.updateLocalGraph(cleanedGraph);

                    // Firestoreから取得したデータをグラフリストに追加
                    this.graphList.push(result);
                } else {
                    // Firestoreにデータがない場合、ローカルデータをそのまま使用
                    this.graphList.push(graph);
                }
            } catch (error) {
                console.error(`Error checking graph ${graph.hash}:`, error);
                // エラー時はローカルデータを使用
                this.graphList.push(graph);
            }
        }

        // // 更新されたリストを保存
        // this.saveToLocal(this.graphList);
    }

    // ローカルストレージの特定のグラフを更新
    updateLocalGraph(updatedGraph) {
        const graphs = this.loadFromLocal();
        const index = graphs.findIndex(g => g.hash === updatedGraph.hash);
        if (index !== -1) {
            graphs[index] = updatedGraph;
            localStorage.setItem(this.storageKey, JSON.stringify(graphs));
        }
    }

    // Firestoreでグラフを検索するメソッド
    async checkGraphInFirestore(hash) {
        try {
            const docRef = doc(db, "graphs", hash);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    hash: data.hash,
                    title: data.title,
                    thumbnail: data.thumbnail,
                    json: data.json,
                    timestamp: data.timestamp,
                    success: true
                };
            } else {
                // Firestoreにデータがない場合
                const localGraphs = this.loadFromLocal();
                const localGraph = localGraphs.find(g => g.hash === hash) || { hash };
                return {
                    ...localGraph,
                    success: false
                };
            }
        } catch (error) {
            console.error("Error querying Firestore:", error);
            // エラー時はローカルデータを使用
            const localGraphs = this.loadFromLocal();
            const localGraph = localGraphs.find(g => g.hash === hash) || { hash };
            return {
                ...localGraph,
                success: false
            };
        }
    }

    // ローカルストレージからグラフ一覧を取得
    loadFromLocal() {
        try {
            const json = localStorage.getItem(this.storageKey);
            if (!json) return [];
            return JSON.parse(json);
        } catch (e) {
            console.warn('グラフデータの読み込みに失敗:', e);
            return [];
        }
    }

    // ローカルストレージにグラフ一覧を保存
    saveToLocal(graphList) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(graphList));
        } catch (e) {
            console.warn('グラフデータの保存に失敗:', e);
        }
    }

    // グラフ一覧を取得
    getGraphList() {
        // 新しい順にソート
        return [...this.graphList].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    // グラフを追加
    addGraph(graphData) {
        // timestampがなければ付与
        if (!graphData.timestamp) {
            graphData.timestamp = Date.now();
        }

        // メモリ上のグラフリストに追加
        this.graphList.push(graphData);

        // ローカルストレージから現在のデータを読み込み
        const localGraphs = this.loadFromLocal();

        // 新しいグラフデータを追加（同じハッシュがある場合は上書き）
        const existingIndex = localGraphs.findIndex(g => g.hash === graphData.hash);
        if (existingIndex >= 0) {
            localGraphs[existingIndex] = graphData;
        } else {
            localGraphs.push(graphData);
        }

        // 更新されたデータをローカルストレージに保存
        localStorage.setItem(this.storageKey, JSON.stringify(localGraphs));
    }

    // グラフを削除（hashで削除）
    removeGraphByHash(hash) {
        this.graphList = this.graphList.filter(g => g.hash !== hash);
        this.saveToLocal(this.graphList);
    }
}
