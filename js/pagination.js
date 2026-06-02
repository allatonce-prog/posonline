/**
 * Pagination Helper Class
 * Manages pagination state and rendering for tables
 */
class PaginationManager {
    constructor(itemsPerPage = 5) {
        this.itemsPerPage = itemsPerPage;
        this.currentPage = 1;
    }

    setPage(page) {
        if (page < 1) page = 1;
        this.currentPage = page;
    }

    paginate(items) {
        const totalPages = Math.ceil(items.length / this.itemsPerPage) || 1;

        // Ensure current page is valid
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;

        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;

        return {
            data: items.slice(start, end),
            totalPages: totalPages,
            currentPage: this.currentPage,
            totalItems: items.length,
            startItem: start + 1,
            endItem: Math.min(end, items.length)
        };
    }

    renderControls(containerId, totalPages, onPageChangeCallback) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Clear existing controls
        container.innerHTML = '';

        if (totalPages <= 1) return;

        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination-controls';
        paginationDiv.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 1rem; margin-top: 1rem; padding: 0.5rem;';

        // Prev Button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-secondary btn-sm';
        prevBtn.innerHTML = '<i class="ph ph-caret-left"></i> Prev';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.onclick = () => {
            this.currentPage--;
            onPageChangeCallback(this.currentPage);
        };

        // Page Info
        const pageInfo = document.createElement('span');
        pageInfo.style.cssText = 'font-size: 0.9rem; font-weight: 500; color: var(--gray-600);';
        pageInfo.textContent = `Page ${this.currentPage} of ${totalPages}`;

        // Next Button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-secondary btn-sm';
        nextBtn.innerHTML = 'Next <i class="ph ph-caret-right"></i>';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.onclick = () => {
            this.currentPage++;
            onPageChangeCallback(this.currentPage);
        };

        paginationDiv.appendChild(prevBtn);
        paginationDiv.appendChild(pageInfo);
        paginationDiv.appendChild(nextBtn);

        container.appendChild(paginationDiv);
    }
}
