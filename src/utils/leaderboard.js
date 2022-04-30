const sortValue = (a, b) => (a[1].gt(b[1])) ? -1 : 1;

class Leaderboard {
    constructor(size) {
        this.size = size;
        this.list = [];
    }

    push(key, value) {
        if (this.list.length < this.size) {
            this.list.push([key, value]);
            this.list.sort(sortValue);
        } else if (value.gt(this.list[this.size - 1][1])) {
            this.list.pop();
            this.list.push([key, value]);
            this.list.sort(sortValue);
        }
    }

    getRank(key) {
        return this.list.findIndex(el => el[0] == key);
    }

    getKeys() {
        return this.list.map(i => i[0]);
    }

    getList() {
        return this.list;
    }
}

module.exports = Leaderboard;